import { NextResponse } from "next/server"
import { getOrCreateUserAiSettings } from "@/lib/server/user-ai-settings-store"

function getUserId(request: Request) {
  return request.headers.get("x-user-id") || "demo-user"
}

export async function GET(request: Request) {
  const userId = getUserId(request)
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
