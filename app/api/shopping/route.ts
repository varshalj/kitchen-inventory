import { NextRequest, NextResponse } from "next/server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const items = await shoppingRepo.list(supabase)

    return NextResponse.json(items)
  } catch (error) {
    console.error("SHOPPING GET ERROR:", error)
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

    const created = await shoppingRepo.create(supabase, payload)

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("SHOPPING POST ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
