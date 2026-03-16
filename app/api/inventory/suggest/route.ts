import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() || ""
    if (q.length < 1) {
      return NextResponse.json([])
    }

    const [inventoryResult, shoppingResult] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("name")
        .eq("user_id", user.id)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(10),
      supabase
        .from("shopping_items")
        .select("name")
        .eq("user_id", user.id)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(10),
    ])

    if (inventoryResult.error) throw inventoryResult.error

    const allNames = [
      ...(inventoryResult.data || []).map((r: any) => r.name as string),
      ...(shoppingResult.data || []).map((r: any) => r.name as string),
    ]
    // Deduplicate (case-insensitive, preserve first occurrence)
    const seen = new Set<string>()
    const unique = allNames.filter((n) => {
      const key = n.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return NextResponse.json(unique.slice(0, 10))
  } catch (error) {
    console.error("INVENTORY SUGGEST ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
