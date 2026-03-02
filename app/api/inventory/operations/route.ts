import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseFromRequest(request)
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    const { itemId, action, addToShoppingList } = body

    if (!itemId || !["consume", "waste"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const updated = await inventoryRepo.update(supabase, itemId, {
      quantity: 0,
      archived: true,
      archiveReason: action === "consume" ? "consumed" : "wasted",
      consumedOn: action === "consume" ? new Date().toISOString() : undefined,
      wastedOn: action === "waste" ? new Date().toISOString() : undefined,
    })

    if (!updated) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    if (action === "consume" && addToShoppingList) {
      await shoppingRepo.create(
        supabase,
        {
          id: Date.now().toString(),
          name: updated.name,
          quantity: 1,
          category: updated.category,
          completed: false,
          addedOn: new Date().toISOString(),
        }
      )
    }

    return NextResponse.json({
      status: "success",
      message: `Item marked as ${action}`,
    })
  } catch (error) {
    return NextResponse.json({ error: "Operation failed" }, { status: 500 })
  }
}
