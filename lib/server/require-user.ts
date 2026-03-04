import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function requireUser() {
  const supabase = await createSupabaseFromRequest()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}
