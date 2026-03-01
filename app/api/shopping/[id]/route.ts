import { NextRequest, NextResponse } from "next/server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const payload = await request.json()
    const updated = await shoppingRepo.update(id, ownerEmail, payload)
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const { id } = await context.params
    const removed = await shoppingRepo.delete(id, ownerEmail)
    return NextResponse.json({ success: removed })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
