import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

function getSupabaseFromRequest(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "")

  if (!accessToken) return null

  const supabase = createClient(
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

  return supabase
}

export async function GET(request: NextRequest) {
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

    const archivedParam = request.nextUrl.searchParams.get("archived")
    const archived = archivedParam === null ? undefined : archivedParam === "true"

    const items = await inventoryRepo.list(user.id, archived)
    return NextResponse.json(items)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
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
