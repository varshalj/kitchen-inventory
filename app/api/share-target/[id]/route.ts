import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from("pending_shares")
    .select("id, image_data, expires_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabase.from("pending_shares").delete().eq("id", id)
    return NextResponse.json({ error: "Expired" }, { status: 410 })
  }

  return NextResponse.json({ imageData: data.image_data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  await supabase.from("pending_shares").delete().eq("id", id).eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}
