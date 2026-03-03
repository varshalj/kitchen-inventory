import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"

export function createSupabaseFromRequest(_request: NextRequest) {
  return createRouteHandlerClient({
    cookies: async () => request.cookies as any,
  })
}
