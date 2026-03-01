import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const updated = await inventoryRepo.update(params.id, {
    quantity: 0,
    consumedOn: new Date().toISOString(),
    archived: true,
    archiveReason: "consumed",
  })

  return updated
    ? NextResponse.json(updated)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}
