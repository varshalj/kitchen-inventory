import { fetchWithAuth } from "@/lib/api-client"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }
}

async function request(path: string, init: RequestInit) {
  assertConfig()
  const response = await fetchWithAuth(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase request failed (${response.status}): ${body}`)
  }

  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export const supabaseServerClient = {
  select: (table: string, query = "select=*") => request(`${table}?${query}`, { method: "GET" }),
  insert: (table: string, payload: unknown) =>
    request(`${table}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    }),
  update: (table: string, query: string, payload: unknown) =>
    request(`${table}?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    }),
  remove: (table: string, query: string) =>
    request(`${table}?${query}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }),
}
