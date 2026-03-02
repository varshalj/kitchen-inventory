import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getUserConfidenceThreshold, logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"


const requestSchema = z.object({
  userInput: z.string().min(1),
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

function fallbackModelOutput(userInput: string) {
  return {
    proposals: [
      {
        name: "Organic Milk",
        category: "Dairy",
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        quantity: 1,
        price: "65",
      },
      {
        name: "Eggs",
        category: "Dairy",
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        quantity: 12,
        price: "89",
      },
    ],
    confidence: 0.86,
    reasoning: `Fallback proposals generated for input: ${userInput.slice(0, 120)}`,
  }
}

async function getModelResponse(userInput: string): Promise<unknown> {
  const modelUrl = process.env.AI_MODEL_URL

  if (!modelUrl) {
    return fallbackModelOutput(userInput)
  }

  const response = await fetch(modelUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: userInput,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "proposal_response",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["proposals", "confidence", "reasoning"],
            properties: {
              proposals: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "category", "expiryDate", "quantity"],
                  properties: {
                    name: { type: "string" },
                    category: { type: "string" },
                    expiryDate: { type: "string" },
                    quantity: { type: "integer", minimum: 1 },
                    price: { type: "string" },
                  },
                },
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reasoning: { type: "string" },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Model request failed with status ${response.status}`)
  }

  return response.json()
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsedRequest = requestSchema.safeParse(body)

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsedRequest.error.flatten() }, { status: 400 })
  }

  const { userInput } = parsedRequest.data
  const userId = user.id

  try {
    const rawModelResponse = await getModelResponse(userInput)
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

    return NextResponse.json({ error: "Failed to generate proposals" }, { status: 500 })
  }
}
