"use client"

import { supabase } from "@/lib/supabase-client"

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

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
