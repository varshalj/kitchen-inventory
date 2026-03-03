import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseFromRequest(request)

    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json()

    const created = await inventoryRepo.create(supabase, payload)

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("🔥 API ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
