import { NextRequest, NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { requireUser } from "@/lib/server/require-user"
import { exchangeCodeForToken, getOrRegisterClient } from "@/lib/server/swiggy/oauth"
import { storeUserToken } from "@/lib/server/swiggy/token-store"

/**
 * Swiggy redirects the user here with ?code=...&state=... after they grant
 * consent. We:
 *
 *   1. Validate state against the cookie (CSRF)
 *   2. Read the PKCE verifier from the cookie
 *   3. POST to /auth/token to exchange the code
 *   4. Encrypt + store the resulting access_token
 *   5. Redirect the user back to their profile with success/error in query
 */
export async function GET(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const stateParam = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")
  const errorDesc = url.searchParams.get("error_description")

  const cookieJar = await cookies()
  const storedState = cookieJar.get("swiggy_oauth_state")?.value
  const verifier = cookieJar.get("swiggy_oauth_verifier")?.value
  const redirectUri = cookieJar.get("swiggy_oauth_redirect_uri")?.value

  // Whatever the outcome, the one-time cookies should be cleared.
  cookieJar.delete("swiggy_oauth_state")
  cookieJar.delete("swiggy_oauth_verifier")
  cookieJar.delete("swiggy_oauth_redirect_uri")

  // ── 1. Surface Swiggy-side errors verbatim. ──────────────────────────────
  if (errorParam) {
    return redirectToProfile(req, {
      swiggy: "error",
      reason: errorParam,
      detail: errorDesc ?? "",
    })
  }

  // ── 2. CSRF check + presence of required params. ─────────────────────────
  if (!code || !stateParam || !verifier || !redirectUri) {
    return redirectToProfile(req, {
      swiggy: "error",
      reason: "missing_oauth_params",
    })
  }
  if (stateParam !== storedState) {
    return redirectToProfile(req, {
      swiggy: "error",
      reason: "state_mismatch",
    })
  }

  // ── 3. Exchange code for token. ──────────────────────────────────────────
  try {
    const { clientId } = await getOrRegisterClient(redirectUri)
    const token = await exchangeCodeForToken({
      code,
      codeVerifier: verifier,
      redirectUri,
      clientId,
    })

    await storeUserToken({
      userId: user.id,
      accessToken: token.access_token,
      tokenType: token.token_type,
      expiresInSeconds: token.expires_in,
      scope: token.scope,
    })

    return redirectToProfile(req, { swiggy: "connected" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    console.error("Swiggy OAuth callback failed:", message)
    return redirectToProfile(req, {
      swiggy: "error",
      reason: "exchange_failed",
      detail: message.slice(0, 200),
    })
  }
}

function redirectToProfile(req: NextRequest, queryParams: Record<string, string>): NextResponse {
  const url = new URL("/profile", req.url)
  for (const [k, v] of Object.entries(queryParams)) {
    if (v) url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}
