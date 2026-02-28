import { NextResponse } from "next/server"
import { revokeActiveUserKey } from "@/lib/server/user-ai-settings-store"

function getUserId(request: Request) {
  return request.headers.get("x-user-id") || "demo-user"
}

export async function POST(request: Request) {
  const userId = getUserId(request)
  const actor = request.headers.get("x-actor") || "self-service"
  const revoked = revokeActiveUserKey({ userId, actor })

  if (!revoked) {
    return NextResponse.json({ success: false, error: "No active key to revoke" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    revoked: {
      version: revoked.version,
      status: revoked.status,
      keyMetadata: revoked.keyMetadata,
      revokedAt: revoked.revokedAt,
    },
  })
}
