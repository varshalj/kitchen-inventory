import { NextRequest, NextResponse } from "next/server"
import { revokeActiveUserKey } from "@/lib/server/user-ai-settings-store"
import { requireUser } from "@/lib/server/require-user"

export async function POST(request: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
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
