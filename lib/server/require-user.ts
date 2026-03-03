import type { NextRequest } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function requireUser(request: NextRequest) {
  void request
  const supabase = createSupabaseFromRequest(request)
  if (!supabase) {
    return { supabase: null, user: null }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}
