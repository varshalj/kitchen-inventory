import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

function getSupabaseFromRequest(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "")

  if (!accessToken) return null

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseFromRequest(request)

    if (!supabase) {
      console.log("❌ No authorization header")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    console.log("👤 Auth user:", user)
    console.log("🔐 Auth error:", authError)

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .order("added_on", { ascending: false })

    console.log("📦 Query data:", data)
    console.log("❗ Query error:", error)

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error("🔥 API ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(request)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json()

    const created = await inventoryRepo.create(payload, user.id)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
