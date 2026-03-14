import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { isFuzzyMatch } from "@/lib/utils"

function shoppingNameMatchesInventory(inventoryName: string, shoppingName: string): boolean {
  const inv = inventoryName.toLowerCase().trim()
  const shop = shoppingName.toLowerCase().trim()
  if (isFuzzyMatch(inv, shop)) return true
  // Generic shopping name contained in brand-specific inventory name
  if (shop.length >= 4 && inv.includes(shop)) return true
  return false
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const archivedParam = request.nextUrl.searchParams.get("archived")
    const archived = archivedParam === null ? undefined : archivedParam === "true"

    const items = await inventoryRepo.list(supabase, archived)

    return NextResponse.json(items)
  } catch (error) {
    console.error("API ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json()

    const created = await inventoryRepo.create(supabase, payload)

    // Auto-complete matching active shopping list items (no duplicate inventory creation
    // since we update the DB directly, bypassing the client toggle handler)
    let completedShoppingItems: Array<{ id: string; name: string }> = []
    try {
      const { data: activeShoppingItems } = await supabase
        .from("shopping_items")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("completed", false)

      const matched = (activeShoppingItems ?? []).filter((s) =>
        shoppingNameMatchesInventory(payload.name ?? "", s.name),
      )

      if (matched.length > 0) {
        await supabase
          .from("shopping_items")
          .update({ completed: true })
          .in("id", matched.map((m) => m.id))
          .eq("user_id", user.id)
        completedShoppingItems = matched.map((m) => ({ id: m.id, name: m.name }))
      }
    } catch {
      // Non-fatal — inventory item was still created successfully
    }

    return NextResponse.json({ ...created, _completedShoppingItems: completedShoppingItems }, { status: 201 })
  } catch (error) {
    console.error("API ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
