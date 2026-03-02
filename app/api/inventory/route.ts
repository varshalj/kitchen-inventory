import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

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

    const archivedRaw = request.nextUrl.searchParams.get("archived")
    const archived = archivedRaw === null ? undefined : archivedRaw === "true"
    const items = await inventoryRepo.list(supabase, archived)

    return NextResponse.json(items)
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
    const supabase = createSupabaseFromRequest(request)
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

    const created = await inventoryRepo.create(supabase, payload)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
