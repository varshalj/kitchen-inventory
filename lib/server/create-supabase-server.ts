import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"

export function createSupabaseFromRequest(request: NextRequest) {
  void request
  return createRouteHandlerClient({
    cookies,
  })
}
