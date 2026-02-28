import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { getOwnerEmail } from "@/lib/server/request-context"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const item = await inventoryRepo.getById(id, ownerEmail)
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const payload = await request.json()
    const updated = await inventoryRepo.update(id, ownerEmail, payload)
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const removed = await inventoryRepo.delete(id, ownerEmail)
    return NextResponse.json({ success: removed })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
