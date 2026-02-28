import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { getOwnerEmail } from "@/lib/server/request-context"

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const updated = await inventoryRepo.update(id, ownerEmail, {
      quantity: 0,
      consumedOn: new Date().toISOString(),
      archived: true,
      archiveReason: "consumed",
    })
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
