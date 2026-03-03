import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export function createSupabaseFromRequest() {
  return createRouteHandlerClient({ cookies })
}
