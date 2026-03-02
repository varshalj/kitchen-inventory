import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseFromRequest(request)
  if (!supabase)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payload = await request.json()

  const updated = await shoppingRepo.update(supabase, params.id, payload)

  return updated
    ? NextResponse.json(updated)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseFromRequest(request)
  if (!supabase)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const removed = await shoppingRepo.delete(supabase, params.id)

  return NextResponse.json({ success: removed })
}
