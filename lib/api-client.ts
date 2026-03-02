"use client"

import { supabase } from "@/lib/supabase-client"

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error("No active Supabase session")
  }

  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  })
}
