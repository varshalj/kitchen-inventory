import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

export async function GET(request: NextRequest) {
  const supabase = createSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const items = await shoppingRepo.list(supabase)
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payload = await request.json()
  const created = await shoppingRepo.create(supabase, payload)
  return NextResponse.json(created, { status: 201 })
}
