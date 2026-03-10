import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"
import OpenAI from "openai"

const requestSchema = z.object({
  transcript: z.string().min(1),
  target: z.string().min(1),
  lang: z.string().optional(),
})

const voiceItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  category: z.string().optional(),
})

const modelOutputSchema = z.object({
  items: z.array(voiceItemSchema),
  confidence: z.number(),
  reasoning: z.string(),
})

function buildVoicePrompt(target: string): string {
  return `You are parsing a spoken grocery list into structured items.
The user may speak in English, Hindi, Hinglish (mixed Hindi-English), or other Indian languages.

Your task:
1. Extract every grocery/food item mentioned.
2. For each item, determine the quantity and unit.
3. Return the item name in English. If the user used a non-English name, translate to the common English grocery name.
4. Merge duplicates: if the same item is mentioned multiple times, combine their quantities.

Rules:
- "name" must be the English name (e.g. "aloo" → "Potato", "tamatar" → "Tomato", "doodh" → "Milk", "atta" → "Wheat Flour", "chawal" → "Rice", "pyaaz" → "Onion", "haldi" → "Turmeric").
- "quantity" must be a number. Default 1 if not specified.
- "unit" must be one of: pcs, g, kg, oz, lb, ml, L, fl oz, cup, dozen. Default "pcs" for countable items. Infer unit from context (e.g. "do kilo" → unit "kg").
- Handle Hindi numerals: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10, aadha=0.5.
- Handle connectors: "and", "aur", commas, "or" all separate items.
${target === "inventory" ? '- "category" should be one of: Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Other.' : '- "category" is optional for shopping items.'}

Return a JSON object:
{
  "items": [{ "name": "...", "quantity": ..., "unit": "..."${target === "inventory" ? ', "category": "..."' : ""} }],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Examples:
- "milk and eggs" → [{"name":"Milk","quantity":1,"unit":"pcs"},{"name":"Eggs","quantity":1,"unit":"pcs"}]
- "do kilo aloo aur teen tamatar" → [{"name":"Potato","quantity":2,"unit":"kg"},{"name":"Tomato","quantity":3,"unit":"pcs"}]
- "half kg paneer" → [{"name":"Paneer","quantity":0.5,"unit":"kg"}]
- "aadha litre doodh" → [{"name":"Milk","quantity":0.5,"unit":"L"}]`
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

function normalizeModelOutput(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  if (!normalized.items && Array.isArray(normalized.proposals)) {
    normalized.items = normalized.proposals
    delete normalized.proposals
  }
  if (!normalized.items && Array.isArray(normalized.results)) {
    normalized.items = normalized.results
    delete normalized.results
  }

  if (Array.isArray(normalized.items)) {
    normalized.items = (normalized.items as Record<string, unknown>[]).map((item) => {
      const out = { ...item }
      if (out.quantity === undefined || out.quantity === null) out.quantity = 1
      if (typeof out.quantity === "string") out.quantity = parseFloat(out.quantity as string) || 1
      if (!out.unit || typeof out.unit !== "string") out.unit = "pcs"
      if (typeof out.name !== "string" || !out.name) out.name = "Unknown Item"
      return out
    })
  }

  if (typeof normalized.confidence !== "number") normalized.confidence = 0.8
  if (typeof normalized.reasoning !== "string" || !normalized.reasoning) {
    normalized.reasoning = "Items parsed from voice input"
  }

  return normalized
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { transcript, target, lang } = parsed.data
  const userId = user.id

  try {
    const client = getOpenAIClient()

    if (!client) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("OPENAI_API_KEY is not configured")
      }
      // Dev fallback
      return NextResponse.json({
        items: [
          { name: "Milk", quantity: 1, unit: "L" },
          { name: "Eggs", quantity: 12, unit: "pcs" },
        ],
        confidence: 0.85,
        reasoning: `Fallback: parsed "${transcript}"`,
        transcript,
      })
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildVoicePrompt(target) },
        { role: "user", content: `Parse this spoken grocery list (language hint: ${lang || "en-IN"}):\n\n"${transcript}"` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 512,
      temperature: 0.2,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error("Empty response from OpenAI")

    const rawParsed = JSON.parse(content)
    const normalized = normalizeModelOutput(rawParsed)
    const validated = modelOutputSchema.safeParse(normalized)

    if (!validated.success) {
      logAIInteraction({
        userId,
        userInput: `[voice] ${transcript}`,
        modelRawResponse: rawParsed,
        parsedResponse: null,
        status: "error",
        errorMessage: validated.error.message,
      })
      return NextResponse.json(
        { error: "Could not parse voice input. Please try again.", details: validated.error.flatten() },
        { status: 422 },
      )
    }

    logAIInteraction({
      userId,
      userInput: `[voice] ${transcript}`,
      modelRawResponse: rawParsed,
      parsedResponse: null,
      status: "success",
    })

    return NextResponse.json({
      ...validated.data,
      transcript,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    logAIInteraction({
      userId,
      userInput: `[voice] ${transcript}`,
      modelRawResponse: null,
      parsedResponse: null,
      status: "error",
      errorMessage: message,
    })

    const status = message.includes("not configured") ? 503 : 500
    return NextResponse.json({ error: "Failed to parse voice input" }, { status })
  }
}
