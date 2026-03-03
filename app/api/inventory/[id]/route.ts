import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const item = await inventoryRepo.getById(supabase, id)

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = await request.json()

    const updated = await inventoryRepo.update(
      supabase,
      id,
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await inventoryRepo.getById(supabase, id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await inventoryRepo.delete(supabase, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE ITEM ERROR:", error)
    const message = (error as Error).message
    const status = message.includes("RLS") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
