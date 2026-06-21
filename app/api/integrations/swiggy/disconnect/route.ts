import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { deleteUserToken } from "@/lib/server/swiggy/token-store"

/**
 * Revoke locally — delete the stored access token. This does NOT call any
 * Swiggy-side revocation endpoint (none documented in v1.0); the token will
 * naturally expire within 5 days.
 *
 * POST instead of DELETE because forms can hit it from the profile UI without
 * fetch().
 */
export async function POST() {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await deleteUserToken(user.id)
  return NextResponse.json({ ok: true })
}
