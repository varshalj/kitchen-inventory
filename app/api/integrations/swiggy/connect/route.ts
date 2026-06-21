import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { requireUser } from "@/lib/server/require-user"
import {
  buildAuthorizeUrl,
  generatePkceChallenge,
  generatePkceVerifier,
  generateState,
  getOrRegisterClient,
} from "@/lib/server/swiggy/oauth"

/**
 * Kicks off the Swiggy OAuth flow.
 *
 * - Generates a PKCE verifier + state CSRF token
 * - Stores both in short-lived httpOnly secure cookies (5-minute TTL)
 * - Redirects the user's browser to Swiggy's authorize endpoint
 *
 * The callback route validates state against the cookie and uses the verifier
 * to redeem the authorization code.
 *
 * Redirect URI is derived from the incoming request's host so that this works
 * unchanged on localhost, Vercel preview, and prod (assuming each redirect URI
 * is whitelisted with Swiggy).
 */
export async function GET() {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const redirectUri = buildRedirectUri(await headers())
  const { clientId } = await getOrRegisterClient(redirectUri)

  const codeVerifier = generatePkceVerifier()
  const codeChallenge = generatePkceChallenge(codeVerifier)
  const state = generateState()

  const cookieJar = await cookies()
  // Short-lived; the flow should complete within minutes. Authorization codes
  // themselves are good for only 120 seconds per Swiggy docs.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 300, // 5 minutes
  }
  cookieJar.set("swiggy_oauth_verifier", codeVerifier, cookieOptions)
  cookieJar.set("swiggy_oauth_state", state, cookieOptions)
  cookieJar.set("swiggy_oauth_redirect_uri", redirectUri, cookieOptions)

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    codeChallenge,
    state,
  })

  return NextResponse.redirect(authorizeUrl)
}

function buildRedirectUri(headers: Headers): string {
  const explicit = process.env.SWIGGY_OAUTH_REDIRECT_URI
  if (explicit) return explicit

  // Derive from request — handles localhost (Next dev), Vercel preview, prod.
  const host = headers.get("host") ?? "localhost:3000"
  const proto = host.startsWith("localhost") ? "http" : "https"
  return `${proto}://${host}/api/integrations/swiggy/callback`
}
