/**
 * Per-user Swiggy access-token storage. Tokens are encrypted at rest with
 * AES-256-GCM (KMS_MASTER_KEY-derived) — same scheme as user AI keys.
 */

import { decryptSecret, encryptSecret } from "./oauth"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

export type SwiggyTokenRow = {
  userId: string
  accessToken: string
  tokenType: string
  scope: string | null
  expiresAt: Date
  lastUsedAt: Date | null
}

export type SwiggyConnectionStatus = {
  connected: boolean
  expiresAt: Date | null
  scope: string | null
  lastUsedAt: Date | null
}

/**
 * Encrypt and upsert a freshly-granted token for the given user. Overwrites
 * any prior token (re-authorization replaces the previous grant).
 */
export async function storeUserToken(params: {
  userId: string
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  scope?: string
}): Promise<void> {
  const encrypted = encryptSecret(params.accessToken)
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000)

  const admin = getSupabaseAdmin() as any
  const { error } = await admin.from("user_swiggy_tokens").upsert(
    {
      user_id: params.userId,
      access_token_ciphertext: encrypted.ciphertext,
      access_token_iv: encrypted.iv,
      access_token_auth_tag: encrypted.authTag,
      access_token_key_version: encrypted.keyVersion,
      token_type: params.tokenType,
      scope: params.scope ?? null,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )

  if (error) {
    throw new Error(`user_swiggy_tokens upsert failed: ${error.message}`)
  }
}

/**
 * Fetch and decrypt the user's access token. Returns null if no row exists.
 * Does NOT check expiration — callers should compare expiresAt and prompt
 * re-auth if needed (Swiggy MCP returns 401 on expired tokens).
 */
export async function getUserToken(userId: string): Promise<SwiggyTokenRow | null> {
  const admin = getSupabaseAdmin() as any
  const { data, error } = await admin
    .from("user_swiggy_tokens")
    .select(
      "access_token_ciphertext, access_token_iv, access_token_auth_tag, access_token_key_version, token_type, scope, expires_at, last_used_at",
    )
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`user_swiggy_tokens lookup failed: ${error.message}`)
  }
  if (!data) return null

  const accessToken = decryptSecret({
    algorithm: "aes-256-gcm",
    keyVersion: data.access_token_key_version,
    iv: data.access_token_iv,
    authTag: data.access_token_auth_tag,
    ciphertext: data.access_token_ciphertext,
  })

  return {
    userId,
    accessToken,
    tokenType: data.token_type,
    scope: data.scope,
    expiresAt: new Date(data.expires_at),
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at) : null,
  }
}

/**
 * Lightweight "is the user connected" check that does NOT decrypt the token.
 * Safe to call from non-sensitive contexts (e.g. UI badge rendering).
 */
export async function getConnectionStatus(userId: string): Promise<SwiggyConnectionStatus> {
  const admin = getSupabaseAdmin() as any
  const { data, error } = await admin
    .from("user_swiggy_tokens")
    .select("expires_at, scope, last_used_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`user_swiggy_tokens lookup failed: ${error.message}`)
  }

  if (!data) {
    return { connected: false, expiresAt: null, scope: null, lastUsedAt: null }
  }

  const expiresAt = new Date(data.expires_at)
  return {
    connected: expiresAt.getTime() > Date.now(),
    expiresAt,
    scope: data.scope,
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at) : null,
  }
}

export async function deleteUserToken(userId: string): Promise<void> {
  const admin = getSupabaseAdmin() as any
  const { error } = await admin.from("user_swiggy_tokens").delete().eq("user_id", userId)
  if (error) {
    throw new Error(`user_swiggy_tokens delete failed: ${error.message}`)
  }
}

/**
 * Bump last_used_at after a successful Swiggy MCP call. Best-effort; failures
 * are logged but don't bubble up — the caller already got their data.
 */
export async function touchLastUsed(userId: string): Promise<void> {
  const admin = getSupabaseAdmin() as any
  const { error } = await admin
    .from("user_swiggy_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
  if (error) {
    console.error("touchLastUsed failed:", error.message)
  }
}
