import { supabase } from "@/lib/supabase-client"

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const { data } = await supabase.auth.getSession()

  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error("No active session")
  }

  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
}
