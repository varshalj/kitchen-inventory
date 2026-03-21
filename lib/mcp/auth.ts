import { createClient } from "@supabase/supabase-js"

/**
 * Extracts a Bearer token from an Authorization header value,
 * creates a Supabase client scoped to that user, and validates the session.
 * Returns { supabase, userId } on success or throws an error.
 */
export async function authenticateMcpRequest(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header")
  }

  const accessToken = authHeader.slice(7)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env vars not configured")
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    throw new Error("Invalid or expired token")
  }

  return { supabase, userId: user.id, userEmail: user.email }
}
