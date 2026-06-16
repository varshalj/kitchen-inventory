/**
 * Swiggy MCP OAuth 2.1 + PKCE helpers.
 *
 * Implements just enough of RFC 7636 (PKCE) and RFC 7591 (Dynamic Client
 * Registration) for kitchen-inventory to act as an OAuth client against the
 * Swiggy MCP. End-users authenticate with their own Swiggy creds; we get a
 * per-user access token bound to their account.
 *
 * See https://mcp.swiggy.com/builders/docs/start/authenticate/
 */

import { createHash, randomBytes } from "crypto"
import { encryptApiKey, decryptApiKey, type EncryptedBlob } from "@/lib/server/ai-key-crypto"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

const SWIGGY_OAUTH_BASE = "https://mcp.swiggy.com"
const PROVIDER = "swiggy"

// Default scopes — Swiggy docs say scopes are server-level, not granular, so
// requesting all three doesn't broaden access beyond what the user grants
// at the consent screen.
const DEFAULT_SCOPES = ["mcp:tools", "mcp:resources", "mcp:prompts"]

export const SWIGGY_AUTHORIZE_URL = `${SWIGGY_OAUTH_BASE}/auth/authorize`
export const SWIGGY_TOKEN_URL = `${SWIGGY_OAUTH_BASE}/auth/token`
const SWIGGY_REGISTER_URL = `${SWIGGY_OAUTH_BASE}/auth/register`

// ─── PKCE (RFC 7636) ─────────────────────────────────────────────────────────

export function generatePkceVerifier(): string {
  // 32 random bytes → 43-char base64url string. Within the 43–128 range
  // mandated by RFC 7636 §4.1.
  return randomBytes(32).toString("base64url")
}

export function generatePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function generateState(): string {
  // CSRF token. 16 bytes is overkill but cheap.
  return randomBytes(16).toString("base64url")
}

// ─── Dynamic Client Registration (RFC 7591) ──────────────────────────────────

type DcrResponse = {
  client_id: string
  client_secret?: string
  redirect_uris?: string[]
  scope?: string
}

/**
 * One-time bootstrap: register this app as an OAuth client with Swiggy.
 * Called lazily by getOrRegisterClient(). Stores the result in oauth_clients.
 *
 * Note: DCR for production redirect URIs may still require manual approval
 * (email builders@swiggy.in). For localhost development, RFC 7591 says
 * registration is open.
 */
async function registerClient(redirectUri: string): Promise<DcrResponse> {
  const body = {
    client_name: "Kitchen Inventory",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // public client; no secret
    scope: DEFAULT_SCOPES.join(" "),
  }

  const response = await fetch(SWIGGY_REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Swiggy DCR failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
    )
  }

  return (await response.json()) as DcrResponse
}

/**
 * Returns the stored client_id for Swiggy, registering it via DCR if no row
 * exists yet. Designed to be called from server routes — no caching beyond
 * the DB lookup.
 */
export async function getOrRegisterClient(redirectUri: string): Promise<{ clientId: string }> {
  const admin = getSupabaseAdmin() as any
  const existing = await admin
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("provider", PROVIDER)
    .maybeSingle()

  if (existing.error) {
    throw new Error(`oauth_clients lookup failed: ${existing.error.message}`)
  }

  // Already registered AND the redirect URI we want to use is allow-listed.
  if (existing.data && existing.data.redirect_uris.includes(redirectUri)) {
    return { clientId: existing.data.client_id }
  }

  // Either no row or new redirect URI — register.
  const registered = await registerClient(redirectUri)

  let encryptedSecret: EncryptedBlob | null = null
  if (registered.client_secret) {
    encryptedSecret = encryptApiKey(registered.client_secret)
  }

  const upsertRow = {
    provider: PROVIDER,
    client_id: registered.client_id,
    client_secret_ciphertext: encryptedSecret?.ciphertext ?? null,
    client_secret_iv: encryptedSecret?.iv ?? null,
    client_secret_auth_tag: encryptedSecret?.authTag ?? null,
    client_secret_key_version: encryptedSecret?.keyVersion ?? null,
    redirect_uris: registered.redirect_uris ?? [redirectUri],
    scopes: registered.scope?.split(" ") ?? DEFAULT_SCOPES,
    updated_at: new Date().toISOString(),
  }

  const { error: upsertError } = await admin
    .from("oauth_clients")
    .upsert(upsertRow, { onConflict: "provider" })

  if (upsertError) {
    throw new Error(`oauth_clients upsert failed: ${upsertError.message}`)
  }

  return { clientId: registered.client_id }
}

// ─── Authorize URL builder ───────────────────────────────────────────────────

export function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
  scope?: string
}): string {
  const url = new URL(SWIGGY_AUTHORIZE_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("code_challenge", params.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", params.state)
  url.searchParams.set("scope", params.scope ?? DEFAULT_SCOPES.join(" "))
  return url.toString()
}

// ─── Code → token exchange ───────────────────────────────────────────────────

export type SwiggyTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

export async function exchangeCodeForToken(params: {
  code: string
  codeVerifier: string
  redirectUri: string
  clientId: string
}): Promise<SwiggyTokenResponse> {
  const response = await fetch(SWIGGY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Swiggy token exchange failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
    )
  }

  return (await response.json()) as SwiggyTokenResponse
}

// Re-export for callers that need to use the same encryption scheme on the
// access token itself (see token-store.ts).
export { encryptApiKey as encryptSecret, decryptApiKey as decryptSecret }
