/**
 * Dev-only endpoint: returns the current authenticated user's Supabase
 * access_token as JSON. Used by voice-agent/test_client.html so we don't
 * have to spelunk through cookies / localStorage to grab a JWT for testing.
 *
 * Security note: this returns the *caller's own* token. It does not grant
 * any new access — the user could already extract the same token from
 * their cookies. Endpoint just makes it copy-pasteable.
 *
 * Auth: relies on the caller's existing Supabase session (cookies). Anyone
 * who isn't signed in gets a 401.
 *
 * Usage:
 *   1. Sign into Kitchen Inventory in a browser tab
 *   2. Visit /api/dev/voice-token in the same browser
 *   3. Copy `access_token` from the JSON response
 *   4. Paste into voice-agent test client's Token field
 */

import { NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function GET() {
  const supabase = await createSupabaseFromRequest()
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session) {
    return NextResponse.json(
      {
        error: "not_authenticated",
        message:
          "No active session. Sign into Kitchen Inventory in this browser first, then reload this URL.",
      },
      { status: 401 },
    )
  }

  return NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at,
    user_id: session.user.id,
    email: session.user.email,
  })
}
