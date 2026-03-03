import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseFromRequest()
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const item = await inventoryRepo.getById(supabase, params.id)

    return item
      ? NextResponse.json(item)
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    console.error("GET ITEM ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseFromRequest()
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = await request.json()

    const updated = await inventoryRepo.update(
      supabase,
      params.id,
      payload
    )

    return NextResponse.json(updated)
  } catch (error) {
    console.error("PATCH ITEM ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseFromRequest()
  if (!supabase) {
    console.log("❌ No supabase instance")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log("Auth user:", user?.id)

  const { data: row } = await supabase
    .from("inventory_items")
    .select("id,user_id")
    .eq("id", params.id)
    .single()

  console.log("Row user_id:", row?.user_id)

  const { data, error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", params.id)
    .select()

  console.log("Delete result:", data, error)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Delete blocked by RLS" }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
