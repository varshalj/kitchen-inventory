const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase environment variables are missing. Auth will be disabled until configured.")
}

export const supabaseUrl = SUPABASE_URL ?? ""
export const supabaseAnonKey = SUPABASE_ANON_KEY ?? ""

const authHeaders = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json",
}

export const authCookieNames = {
  accessToken: "sb-access-token",
  refreshToken: "sb-refresh-token",
}

export async function requestSupabaseAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(errorBody || `Supabase auth request failed with ${response.status}`)
  }

  return (await response.json()) as T
}
