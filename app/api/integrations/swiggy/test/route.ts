import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { getAddresses, SwiggyMcpError } from "@/lib/server/swiggy/mcp-client"
import { getUserToken } from "@/lib/server/swiggy/token-store"

/**
 * End-to-end smoke test: fetches the user's saved Swiggy addresses via the
 * Instamart MCP server. If this returns data, the OAuth flow is working
 * correctly and the token has the right scopes.
 *
 * Used by the "Test connection" button in the profile UI.
 */
export async function GET() {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stored = await getUserToken(user.id)
  if (!stored) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect Swiggy first." },
      { status: 412 },
    )
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "token_expired", message: "Reconnect Swiggy to refresh the token." },
      { status: 412 },
    )
  }

  try {
    const result = await getAddresses({
      userId: user.id,
      accessToken: stored.accessToken,
    })
    return NextResponse.json({
      ok: true,
      result,
    })
  } catch (err) {
    if (err instanceof SwiggyMcpError && err.status === 401) {
      return NextResponse.json(
        { error: "token_rejected", message: "Swiggy rejected the token. Reconnect to continue." },
        { status: 401 },
      )
    }
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "swiggy_call_failed", message }, { status: 502 })
  }
}
