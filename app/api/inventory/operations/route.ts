import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { itemId, action, addToShoppingList } = await request.json()

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

    if (!updated)
      return NextResponse.json({ error: "Update blocked by RLS" }, { status: 403 })

    let shoppingItemId: string | undefined
    let wasNewInsert = true
    let previousShoppingQuantity: number | undefined

    if (action === "consume" && addToShoppingList) {
      // Check if item already exists in active shopping list before merging
      const { data: existingItems } = await supabase
        .from("shopping_items")
        .select("id, quantity")
        .eq("name", updated.name)
        .eq("completed", false)
        .eq("user_id", user.id)
        .limit(1)

      const existingShoppingItem = existingItems?.[0]
      wasNewInsert = !existingShoppingItem
      previousShoppingQuantity = existingShoppingItem?.quantity

      const createdShoppingItem = await shoppingRepo.create(supabase, {
        id: crypto.randomUUID(),
        name: updated.name,
        quantity: updated.quantity ?? 1,
        unit: updated.unit || undefined,
        category: updated.category,
        completed: false,
        addedOn: new Date().toISOString(),
        addedFrom: "consumed",
        brand: updated.brand || undefined,
        orderedFrom: updated.orderedFrom || undefined,
      })
      shoppingItemId = createdShoppingItem.id
    }

    return NextResponse.json({ success: true, shoppingItemId, wasNewInsert, previousShoppingQuantity })
  } catch (error) {
    console.error("OPERATIONS ERROR:", error)
    return NextResponse.json({ error: "Operation failed" }, { status: 500 })
  }
}
