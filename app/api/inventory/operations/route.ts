import { NextRequest, NextResponse } from "next/server"
import type { InventoryItem } from "@/lib/types"
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

    const {
      itemId,
      action,
      addToShoppingList,
      originalQuantity,
      originalUnit,
      quantityConsumed,
      quantityWasted,
      wastageReason,
    } = await request.json()

    if (!itemId || !["consume", "waste"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const EPS = 1e-6
    const VALID_WASTE_REASONS = ["expired", "spoiled", "unused", "excess"]
    // Partial mode is opt-in: only engaged when the client sends split quantities.
    // When omitted, the full-item all-or-nothing behaviour below is unchanged.
    const isPartialConsume =
      action === "consume" && (quantityConsumed != null || quantityWasted != null)

    let updated
    let fullyDepleted = true
    let wasteRecordId: string | undefined

    if (isPartialConsume) {
      const item = await inventoryRepo.getById(supabase, itemId)
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

      // Trust the stored quantity/price, never the client's, for all math.
      const storedQty = Number(item.quantity) || 0
      const consumed = Number(quantityConsumed ?? 0)
      const wasted = Number(quantityWasted ?? 0)

      if (![consumed, wasted].every((n) => Number.isFinite(n) && n >= 0) || consumed + wasted <= EPS) {
        return NextResponse.json({ error: "Invalid quantities" }, { status: 400 })
      }
      if (consumed + wasted > storedQty + EPS) {
        return NextResponse.json({ error: "Quantities exceed available stock" }, { status: 400 })
      }
      if (wastageReason != null && !VALID_WASTE_REASONS.includes(wastageReason)) {
        return NextResponse.json({ error: "Invalid wastage reason" }, { status: 400 })
      }

      // Split off the wasted portion as its own archived row so it flows into
      // waste analytics, with price prorated by the wasted fraction.
      if (wasted > EPS) {
        const proratedPrice =
          item.price != null && storedQty > 0
            ? ((wasted / storedQty) * Number(item.price)).toFixed(2)
            : undefined
        const wasteRow = await inventoryRepo.create(supabase, {
          name: item.name,
          category: item.category,
          location: item.location,
          quantity: wasted,
          unit: item.unit,
          brand: item.brand,
          orderedFrom: item.orderedFrom,
          price: proratedPrice,
          archived: true,
          archiveReason: "wasted",
          wastedOn: new Date().toISOString(),
          wastageReason: (wastageReason ?? null) as InventoryItem["wastageReason"],
        } as InventoryItem)
        wasteRecordId = wasteRow.id
      }

      const remaining = storedQty - consumed - wasted
      fullyDepleted = remaining <= EPS

      updated = await inventoryRepo.update(
        supabase,
        itemId,
        fullyDepleted
          ? { quantity: 0, archived: true, archiveReason: "consumed", consumedOn: new Date().toISOString() }
          : { quantity: Number(remaining.toFixed(3)) },
      )
    } else {
      updated = await inventoryRepo.update(supabase, itemId, {
        quantity: 0,
        archived: true,
        archiveReason: action === "consume" ? "consumed" : "wasted",
        consumedOn: action === "consume" ? new Date().toISOString() : undefined,
        wastedOn: action === "waste" ? new Date().toISOString() : undefined,
      })
    }

    if (!updated)
      return NextResponse.json({ error: "Update blocked by RLS" }, { status: 403 })

    let shoppingItemId: string | undefined
    let wasNewInsert = true
    let previousShoppingQuantity: number | undefined

    // Only restock the shopping list once the item is actually depleted —
    // a partial consume that leaves a remainder keeps the item in inventory.
    if (action === "consume" && addToShoppingList && fullyDepleted) {
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
        // Use originalQuantity from the client — updated.quantity is already 0 after archiving
        quantity: originalQuantity != null && originalQuantity > 0 ? originalQuantity : 1,
        unit: (originalUnit || updated.unit) || undefined,
        category: updated.category,
        completed: false,
        addedOn: new Date().toISOString(),
        addedFrom: "consumed",
        brand: updated.brand || undefined,
        orderedFrom: updated.orderedFrom || undefined,
      })
      shoppingItemId = createdShoppingItem.id
    }

    return NextResponse.json({
      success: true,
      shoppingItemId,
      wasNewInsert,
      previousShoppingQuantity,
      fullyDepleted,
      remainingQuantity: updated.quantity,
      wasteRecordId,
    })
  } catch (error) {
    console.error("OPERATIONS ERROR:", error)
    return NextResponse.json({ error: "Operation failed" }, { status: 500 })
  }
}
