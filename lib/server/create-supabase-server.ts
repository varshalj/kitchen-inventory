import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import type { NextRequest } from "next/server"

export function createSupabaseFromRequest(request: NextRequest) {
  return createRouteHandlerClient({
    cookies: async () => request.cookies as any,
  })
}
