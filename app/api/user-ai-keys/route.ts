import { NextResponse } from "next/server"
import { getOrCreateUserAiSettings } from "@/lib/server/user-ai-settings-store"
import { requireUser } from "@/lib/server/require-user"

export async function GET() {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const record = getOrCreateUserAiSettings(userId)

  return NextResponse.json({
    userId: record.userId,
    activeVersion: record.activeVersion,
    keyVersions: record.keyVersions.map((version) => ({
      version: version.version,
      provider: version.provider,
      model: version.model,
      status: version.status,
      keyMetadata: version.keyMetadata,
      createdAt: version.createdAt,
      revokedAt: version.revokedAt,
    })),
    auditTrail: record.auditTrail,
  })
}
