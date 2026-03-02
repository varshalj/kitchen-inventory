import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

function getSupabaseFromRequest(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return null

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  )
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const items = await shoppingRepo.list(user.id)
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payload = await request.json()
  const created = await shoppingRepo.create(payload, user.id)
  return NextResponse.json(created, { status: 201 })
}
