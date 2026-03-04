import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createSupabaseFromRequest()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const updated = await inventoryRepo.update(supabase, id, {
      quantity: 0,
      wastedOn: new Date().toISOString(),
      archived: true,
      archiveReason: "wasted",
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("WASTE ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
