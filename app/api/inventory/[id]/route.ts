import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseFromRequest(request)
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
    const supabase = createSupabaseFromRequest(request)
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
  try {
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 🔎 DEBUG START
    console.log("AUTH USER ID:", user.id)

    const { data: row } = await supabase
      .from("inventory_items")
      .select("user_id")
      .eq("id", params.id)
      .single()

    console.log("ROW USER ID:", row?.user_id)
    // 🔎 DEBUG END

    await inventoryRepo.delete(supabase, params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE ITEM ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
