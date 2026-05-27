import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"
import OpenAI from "openai"

// Bump this any time the system prompt is meaningfully edited so we can filter
// training data by prompt era. See migration 202605270001.
const PROMPT_VERSION = "voice-v3-categories-expanded"
const MODEL_VERSION = "gpt-4o-mini"

const requestSchema = z.object({
  transcript: z.string().min(1),
  target: z.string().min(1),
  lang: z.string().optional(),
})

const voiceItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  // Required: normalizeModelOutput coerces missing units to 'pcs' before validation,
  // matching the DB-level NOT NULL constraint (migration 202605270002).
  unit: z.string().min(1),
  category: z.string().optional(),
  // SLM-readiness — captured silently from the model. All optional so the API
  // stays backward-compatible if the model omits them.
  name_raw: z.string().nullable().optional(),
  quantity_raw: z.string().nullable().optional(),
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
${target === "inventory" ? `- "category" should be one of: Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Spices, Dry Fruits, Supplement, Medicine, Other.
  Category tiebreakers:
  - Dry Fruits vs Snacks: whole or sliced nuts and dried fruits as pantry ingredients (almonds, cashews, raisins, dates, walnuts, figs, pista) — even if roasted or salted — go to Dry Fruits. Packaged ready-to-eat with added flavorings or coatings (chocolate-covered almonds, namkeen, trail mix with seasoning) go to Snacks.
  - Supplement vs Medicine: vitamins, multivitamins, protein powder, mass gainer, omega-3, ashwagandha, herbal capsules go to Supplement. OTC and prescription drugs (paracetamol, ibuprofen, antacids, cough syrup, antibiotics, ointments) go to Medicine.
  - Condiments vs Spices: bottled/jarred sauces, ketchup, mayo, pickles go to Condiments. Whole or ground spices (turmeric, jeera, garam masala, salt, pepper) go to Spices.` : '- "category" is optional for shopping items.'}

Provenance fields (REQUIRED — preserved verbatim for training data):
- "name_raw": the literal substring from the user's transcript that referred to this item (e.g. "doodh", "aloo", "paneer"). Preserve original casing and language. Do NOT translate or normalise.
- "quantity_raw": the literal quantity phrase as spoken (e.g. "do kilo", "half kg", "ek litre", "aadha"). Set to null if no quantity was spoken.

Return a JSON object:
{
  "items": [{ "name": "...", "quantity": ..., "unit": "..."${target === "inventory" ? ', "category": "..."' : ""}, "name_raw": "...", "quantity_raw": "..." }],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Examples:
- "milk and eggs" → [{"name":"Milk","quantity":1,"unit":"pcs","name_raw":"milk","quantity_raw":null},{"name":"Eggs","quantity":1,"unit":"pcs","name_raw":"eggs","quantity_raw":null}]
- "do kilo aloo aur teen tamatar" → [{"name":"Potato","quantity":2,"unit":"kg","name_raw":"aloo","quantity_raw":"do kilo"},{"name":"Tomato","quantity":3,"unit":"pcs","name_raw":"tamatar","quantity_raw":"teen"}]
- "half kg paneer" → [{"name":"Paneer","quantity":0.5,"unit":"kg","name_raw":"paneer","quantity_raw":"half kg"}]
- "aadha litre doodh" → [{"name":"Milk","quantity":0.5,"unit":"L","name_raw":"doodh","quantity_raw":"aadha litre"}]`
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
      // Dev fallback — no interaction id so the client falls back to no-finalize path.
      return NextResponse.json({
        items: [
          { name: "Milk", quantity: 1, unit: "L", name_raw: "milk", quantity_raw: null },
          { name: "Eggs", quantity: 12, unit: "pcs", name_raw: "eggs", quantity_raw: "12" },
        ],
        confidence: 0.85,
        reasoning: `Fallback: parsed "${transcript}"`,
        transcript,
      })
    }

    const completion = await client.chat.completions.create({
      model: MODEL_VERSION,
      messages: [
        { role: "system", content: buildVoicePrompt(target) },
        { role: "user", content: `Parse this spoken grocery list (language hint: ${lang || "en-IN"}):\n\n"${transcript}"` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 768,
      temperature: 0.2,
    })

    // ── Capture literal model output BEFORE JSON.parse / normalise (leg b). ──
    const modelRawText = completion.choices[0]?.message?.content ?? null
    if (!modelRawText) throw new Error("Empty response from OpenAI")

    const rawParsed = JSON.parse(modelRawText)
    const normalized = normalizeModelOutput(rawParsed)
    const validated = modelOutputSchema.safeParse(normalized)

    if (!validated.success) {
      await logAIInteraction({
        userId,
        userInput: `[voice] ${transcript}`,
        modelRawText,
        modelNormalizedResponse: normalized,
        parsedResponse: null,
        status: "error",
        errorMessage: validated.error.message,
        modelVersion: MODEL_VERSION,
        promptVersion: PROMPT_VERSION,
        surface: "voice",
      })
      return NextResponse.json(
        { error: "Could not parse voice input. Please try again.", details: validated.error.flatten() },
        { status: 422 },
      )
    }

    const interactionId = await logAIInteraction({
      userId,
      userInput: `[voice] ${transcript}`,
      modelRawText,
      modelNormalizedResponse: normalized,
      parsedResponse: validated.data,
      status: "success",
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      surface: "voice",
    })

    return NextResponse.json({
      ...validated.data,
      transcript,
      aiInteractionId: interactionId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    await logAIInteraction({
      userId,
      userInput: `[voice] ${transcript}`,
      modelRawText: null,
      modelNormalizedResponse: null,
      parsedResponse: null,
      status: "error",
      errorMessage: message,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      surface: "voice",
    })

    const status = message.includes("not configured") ? 503 : 500
    return NextResponse.json({ error: "Failed to parse voice input" }, { status })
  }
}
