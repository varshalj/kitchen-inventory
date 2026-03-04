import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getUserConfidenceThreshold, logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"
import OpenAI from "openai"

const requestSchema = z.object({
  userInput: z.string().min(1),
  imageBase64: z.string().optional(),
})

const proposalSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  expiryDate: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.string().optional(),
})

const modelOutputSchema = z.object({
  proposals: z.array(proposalSchema).min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})

const SYSTEM_PROMPT = `You are an AI assistant that extracts grocery/kitchen inventory items from user descriptions or images.

Given a user's text description or an image of groceries, a receipt, or food items, extract each item and return structured JSON.

You MUST return a JSON object with exactly these keys:
- "proposals": an array of item objects, each with:
  - "name" (string): the item name
  - "category" (string): one of Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Other
  - "expiryDate" (string): estimated expiry date in YYYY-MM-DD format
  - "quantity" (integer): quantity, default 1
  - "price" (string, optional): price if visible
- "confidence" (number): a number between 0 and 1
- "reasoning" (string): a brief explanation of what was detected

Example response:
{"proposals":[{"name":"Milk","category":"Dairy","expiryDate":"2026-03-11","quantity":1}],"confidence":0.9,"reasoning":"Detected 1 dairy item"}`

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

/**
 * GPT sometimes returns variations like "items" instead of "proposals",
 * or wraps the array in a different key, or omits confidence/reasoning.
 * This normalizes common variations into the expected shape.
 */
function normalizeModelOutput(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  if (!normalized.proposals && Array.isArray(normalized.items)) {
    normalized.proposals = normalized.items
    delete normalized.items
  }
  if (!normalized.proposals && Array.isArray(normalized.results)) {
    normalized.proposals = normalized.results
    delete normalized.results
  }
  if (!normalized.proposals && Array.isArray(normalized.extracted_items)) {
    normalized.proposals = normalized.extracted_items
    delete normalized.extracted_items
  }

  if (Array.isArray(normalized.proposals)) {
    normalized.proposals = (normalized.proposals as Record<string, unknown>[]).map((item) => {
      const out = { ...item }
      if (!out.expiryDate && out.expiry_date) {
        out.expiryDate = out.expiry_date
        delete out.expiry_date
      }
      if (!out.expiryDate && out.expiration_date) {
        out.expiryDate = out.expiration_date
        delete out.expiration_date
      }
      if (out.quantity === undefined || out.quantity === null) {
        out.quantity = 1
      }
      if (typeof out.quantity === "string") {
        out.quantity = parseInt(out.quantity, 10) || 1
      }
      if (typeof out.price === "number") {
        out.price = String(out.price)
      }
      return out
    })
  }

  if (typeof normalized.confidence !== "number") {
    normalized.confidence = 0.8
  }
  if (typeof normalized.reasoning !== "string" || !normalized.reasoning) {
    normalized.reasoning = "Items extracted from input"
  }

  return normalized
}

async function getModelResponse(userInput: string, imageBase64?: string): Promise<unknown> {
  const client = getOpenAIClient()

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OPENAI_API_KEY is not configured")
    }
    return fallbackModelOutput(userInput)
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ]

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userInput },
        {
          type: "image_url",
          image_url: {
            url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            detail: "low",
          },
        },
      ],
    })
  } else {
    messages.push({ role: "user", content: userInput })
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    max_tokens: 1024,
    temperature: 0.3,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("Empty response from OpenAI")

  const parsed = JSON.parse(content)
  return normalizeModelOutput(parsed)
}

function fallbackModelOutput(userInput: string) {
  const today = new Date()
  return {
    proposals: [
      {
        name: "Organic Milk",
        category: "Dairy",
        expiryDate: new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0],
        quantity: 1,
        price: "65",
      },
      {
        name: "Eggs",
        category: "Dairy",
        expiryDate: new Date(today.getTime() + 14 * 86400000).toISOString().split("T")[0],
        quantity: 12,
        price: "89",
      },
    ],
    confidence: 0.86,
    reasoning: `Fallback proposals generated for input: ${userInput.slice(0, 120)}`,
  }
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsedRequest = requestSchema.safeParse(body)

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsedRequest.error.flatten() }, { status: 400 })
  }

  const { userInput, imageBase64 } = parsedRequest.data
  const userId = user.id

  try {
    const rawModelResponse = await getModelResponse(userInput, imageBase64)
    const parsedOutput = modelOutputSchema.safeParse(rawModelResponse)

    if (!parsedOutput.success) {
      console.error("Zod validation failed:", parsedOutput.error.message, "Raw:", JSON.stringify(rawModelResponse))

      logAIInteraction({
        userId,
        userInput,
        modelRawResponse: rawModelResponse,
        parsedResponse: null,
        status: "error",
        errorMessage: parsedOutput.error.message,
      })

      return NextResponse.json(
        { error: "Could not parse AI response. Please try again.", details: parsedOutput.error.flatten() },
        { status: 422 },
      )
    }

    logAIInteraction({
      userId,
      userInput,
      modelRawResponse: rawModelResponse,
      parsedResponse: parsedOutput.data,
      status: "success",
    })

    const threshold = getUserConfidenceThreshold(userId)

    return NextResponse.json({
      ...parsedOutput.data,
      confidenceThreshold: threshold,
      canBulkApply: parsedOutput.data.confidence >= threshold,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model error"

    logAIInteraction({
      userId,
      userInput,
      modelRawResponse: null,
      parsedResponse: null,
      status: "error",
      errorMessage: message,
    })

    const status = message.includes("not configured") ? 503 : 500
    return NextResponse.json({ error: "Failed to generate proposals" }, { status })
  }
}
