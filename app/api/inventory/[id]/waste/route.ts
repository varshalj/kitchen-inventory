import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseFromRequest(request)
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const updated = await inventoryRepo.update(supabase, params.id, {
    quantity: 0,
    wastedOn: new Date().toISOString(),
    archived: true,
    archiveReason: "wasted",
  })

  return updated
    ? NextResponse.json(updated)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}
