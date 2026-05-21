import { createHmac } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Mint a Supabase-compatible HS256 JWT for the given user_id. Lets server-side
// callers (cron jobs, voice-skill backends, webhooks) build a Supabase client
// that behaves identically to a real user session — RLS applies, the existing
// repos work unchanged.
//
// Requires SUPABASE_JWT_SECRET in env (Project Settings → API → JWT Secret in
// the Supabase dashboard). This is NOT the anon key or service role key.

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function signSupabaseJwt(userId: string, secret: string, ttlSeconds = 600): string {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + ttlSeconds,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = b64url(createHmac("sha256", secret).update(signingInput).digest())
  return `${signingInput}.${sig}`
}

export function supabaseAsUser(userId: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!url || !anon) throw new Error("Supabase URL or anon key not configured")
  if (!jwtSecret) throw new Error("SUPABASE_JWT_SECRET not configured")
  if (!userId) throw new Error("userId is required")

  const token = signSupabaseJwt(userId, jwtSecret)

  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
