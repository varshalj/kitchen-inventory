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

    const { data, error } = await supabase
      .from("inventory_items")
      .select("name")
      .eq("user_id", user.id)
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(10)

    if (error) throw error

    // Deduplicate names (inventory may have multiple entries for same item)
    const unique = [...new Set((data || []).map((r: any) => r.name as string))]
    return NextResponse.json(unique)
  } catch (error) {
    console.error("INVENTORY SUGGEST ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
