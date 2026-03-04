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
  proposals: z.array(proposalSchema),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})

const SYSTEM_PROMPT = `You are an AI assistant that extracts grocery/kitchen inventory items from user descriptions or images.

Given a user's text description or an image of groceries, a receipt, or food items, extract each item and return structured data.

For each item provide:
- name: the item name
- category: one of Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Other
- expiryDate: estimated expiry date in YYYY-MM-DD format (use reasonable defaults based on the item type)
- quantity: integer quantity (default 1)
- price: price as a string if visible (optional)

Also provide:
- confidence: a number between 0 and 1 indicating how confident you are in the extraction
- reasoning: a brief explanation of what was detected

Return valid JSON matching this exact schema:
{
  "proposals": [{ "name": "...", "category": "...", "expiryDate": "YYYY-MM-DD", "quantity": 1, "price": "..." }],
  "confidence": 0.9,
  "reasoning": "..."
}`

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
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
          image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
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
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("Empty response from OpenAI")

  return JSON.parse(content)
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
      logAIInteraction({
        userId,
        userInput,
        modelRawResponse: rawModelResponse,
        parsedResponse: null,
        status: "error",
        errorMessage: parsedOutput.error.message,
      })

      return NextResponse.json({ error: "Malformed model output rejected" }, { status: 422 })
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
