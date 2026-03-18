import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getUserConfidenceThreshold, logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"
import OpenAI from "openai"

const requestSchema = z.object({
  userInput: z.string().min(1),
  imageBase64: z.string().optional(),
  imagesBase64: z.array(z.string()).max(5).optional(),
})

const proposalSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().min(1),
  expiryDate: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  price: z.string().optional(),
})

const modelOutputSchema = z.object({
  proposals: z.array(proposalSchema),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0]
  return `You are an AI assistant that extracts grocery/kitchen inventory items from user descriptions or images.

Given a user's text description, an image of groceries, a receipt, product packaging, or a kitchen shelf/cabinet/refrigerator, extract each item and return structured JSON.

You are capable of visually recognizing products from kitchen shelves, pantry cabinets, and refrigerators. Identify products by their packaging shape, color, logo, and brand — even if labels are partially obscured or at an angle. For Indian households, recognize common brands: Aashirvaad, Tata, Amul, Maggi, MDH, Haldiram's, Fortune, Mother Dairy, Parle, Britannia, Nestlé, ITC, Dabur, Patanjali, MTR, Everest, and others.

If multiple images are provided, treat them as different views of the same kitchen or pantry. Extract ALL unique items across all images. Do NOT duplicate items that appear in multiple images — include each distinct product only once.

For each item, separate the brand name from the generic item name:
- "Amul Butter" → name: "Butter", brand: "Amul"
- "Maggi 2-Minute Noodles" → name: "Noodles", brand: "Maggi"
- "Tata Salt" → name: "Salt", brand: "Tata"
- "Aashirvaad Atta" → name: "Whole Wheat Flour", brand: "Aashirvaad"
- The "name" field must always be the generic product type — never include the brand in the name.
- If no brand is visible or identifiable, omit the "brand" field entirely.

Today's date is ${today}. Use this as the base when estimating expiry dates.
Typical shelf lives for reference: fresh produce 3-7 days, dairy 7-14 days, meat 2-5 days, bread 5-7 days, canned goods 1-2 years, frozen items 3-6 months, snacks/dry goods 1-6 months.

You MUST return a JSON object with exactly these keys:
- "proposals": an array of item objects, each with:
  - "name" (string): generic product type only — no brand (e.g. "Butter", not "Amul Butter")
  - "brand" (string, optional): brand name if identifiable (e.g. "Amul")
  - "category" (string): one of Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Other
  - "expiryDate" (string): estimated expiry date in YYYY-MM-DD format, calculated from today (${today})
  - "quantity" (number): numeric quantity value, can be decimal (e.g. 0.5, 2.5). Default 1.
  - "unit" (string): the unit for quantity. Valid units: pcs, g, kg, oz, lb, ml, L, fl oz, cup. Use "pcs" for countable items (e.g. eggs, apples). Use weight/volume units for bulk items (e.g. 500g flour, 1L milk). Default "pcs".
  - "price" (string, optional): price if visible
- "confidence" (number): a number between 0 and 1
- "reasoning" (string): a brief explanation of what was detected

Examples:
- 500g flour → {"quantity": 500, "unit": "g"}
- 1 litre milk → {"quantity": 1, "unit": "L"}
- 6 eggs → {"quantity": 6, "unit": "pcs"}
- 250ml juice → {"quantity": 250, "unit": "ml"}

Example response:
{"proposals":[{"name":"Butter","brand":"Amul","category":"Dairy","expiryDate":"${new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0]}","quantity":1,"unit":"pcs"}],"confidence":0.9,"reasoning":"Detected Amul Butter on shelf"}`
}

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
        out.quantity = parseFloat(out.quantity) || 1
      }
      if (!out.unit || typeof out.unit !== "string") {
        out.unit = "pcs"
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

async function getModelResponse(userInput: string, imageBase64?: string, imagesBase64?: string[]): Promise<unknown> {
  const client = getOpenAIClient()

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OPENAI_API_KEY is not configured")
    }
    return fallbackModelOutput(userInput)
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
  ]

  if (imagesBase64 && imagesBase64.length > 0) {
    // Multi-image path: build a user message with all image_url blocks
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imagesBase64.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
        detail: "auto" as const,
      },
    }))
    messages.push({
      role: "user",
      content: [{ type: "text", text: userInput }, ...imageBlocks],
    })
  } else if (imageBase64) {
    // Single-image path (camera capture)
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userInput },
        {
          type: "image_url",
          image_url: {
            url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            detail: "auto" as const,
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
    max_tokens: 2048,
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

  const { userInput, imageBase64, imagesBase64 } = parsedRequest.data
  const userId = user.id

  try {
    const rawModelResponse = await getModelResponse(userInput, imageBase64, imagesBase64)
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
