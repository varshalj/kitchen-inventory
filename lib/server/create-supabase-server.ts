import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

export function createSupabaseFromRequest(request: NextRequest) {
  const token = request.headers.get("authorization")

  if (!token) return null

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: token,
        },
      },
    }
  )
}
