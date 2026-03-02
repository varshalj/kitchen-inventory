import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

function getSupabaseFromRequest(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return null

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(request)
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    const { itemId, action, addToShoppingList } = body

    if (!itemId || !["consume", "waste"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const updated = await inventoryRepo.update(itemId, user.id, {
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
        {
          id: Date.now().toString(),
          name: updated.name,
          quantity: 1,
          category: updated.category,
          completed: false,
          addedOn: new Date().toISOString(),
        },
        user.id
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
