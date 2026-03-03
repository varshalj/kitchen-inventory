"use client"

export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
    },
  })
}
