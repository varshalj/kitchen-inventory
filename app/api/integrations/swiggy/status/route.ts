import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { getConnectionStatus } from "@/lib/server/swiggy/token-store"

/**
 * Lightweight "am I connected?" endpoint. Does NOT decrypt the token —
 * safe to poll from UI without exposing the secret.
 */
export async function GET() {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const status = await getConnectionStatus(user.id)
  return NextResponse.json({
    connected: status.connected,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    scope: status.scope,
    lastUsedAt: status.lastUsedAt?.toISOString() ?? null,
  })
}
