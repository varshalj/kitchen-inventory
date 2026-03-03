import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json()

    const updated = await shoppingRepo.update(
      supabase,
      id,
      payload
    )

    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    console.error("SHOPPING PATCH ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await shoppingRepo.getById(supabase, id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await shoppingRepo.delete(supabase, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("SHOPPING DELETE ERROR:", error)
    const message = (error as Error).message
    const status = message.includes("RLS") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
