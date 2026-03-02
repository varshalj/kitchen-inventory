import { NextRequest, NextResponse } from "next/server"
import { validateOpenAiKey } from "@/lib/server/ai-provider-validation"
import { createValidatedSnapshot } from "@/lib/server/user-ai-settings-store"
import { requireUser } from "@/lib/server/require-user"

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const apiKey = String(body.apiKey || "").trim()
    const model = String(body.model || "gpt-4o-mini").trim()

    if (!apiKey) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 })
    }

    await validateOpenAiKey({ apiKey, model })
    const metadata = createValidatedSnapshot(apiKey)

    return NextResponse.json({
      valid: true,
      provider: "openai",
      model,
      keyMetadata: metadata,
    })
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: error instanceof Error ? error.message : "Validation failed" },
      { status: 400 },
    )
  }
}
