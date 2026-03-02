import { NextRequest, NextResponse } from "next/server"
import { validateOpenAiKey } from "@/lib/server/ai-provider-validation"
import { addValidationAudit, rotateUserKey } from "@/lib/server/user-ai-settings-store"
import { requireUser } from "@/lib/server/require-user"

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const userId = user.id
    const actor = request.headers.get("x-actor") || "self-service"
    const apiKey = String(body.apiKey || "").trim()
    const model = String(body.model || "gpt-4o-mini").trim()

    if (!apiKey) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 })
    }

    await validateOpenAiKey({ apiKey, model })
    const version = rotateUserKey({ userId, actor, apiKey, model })
    addValidationAudit({ userId, actor, version: version.version, model })

    return NextResponse.json({
      success: true,
      version: {
        version: version.version,
        provider: version.provider,
        model: version.model,
        status: version.status,
        keyMetadata: version.keyMetadata,
        createdAt: version.createdAt,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Rotation failed" },
      { status: 400 },
    )
  }
}
