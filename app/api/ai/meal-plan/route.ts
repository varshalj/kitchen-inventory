import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import OpenAI from "openai"

export async function POST(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const prompt = body?.prompt
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  }

  try {
    const client = new OpenAI({ apiKey })

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful meal planning assistant. Create detailed, practical meal plans based on the user's available ingredients. Format the plan clearly with days, meals, ingredients, and brief cooking instructions.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2048,
    })

    const mealPlan = completion.choices[0]?.message?.content
    if (!mealPlan) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 })
    }

    return NextResponse.json({ mealPlan })
  } catch (error) {
    console.error("MEAL PLAN ERROR:", error)
    return NextResponse.json({ error: "Failed to generate meal plan" }, { status: 500 })
  }
}
