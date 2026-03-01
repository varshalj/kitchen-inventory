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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payload = await request.json()
  const updated = await shoppingRepo.update(params.id, payload)

  return updated
    ? NextResponse.json(updated)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const removed = await shoppingRepo.delete(params.id)
  return NextResponse.json({ success: removed })
}
