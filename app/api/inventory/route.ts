import { NextRequest, NextResponse } from "next/server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { getOwnerEmail } from "@/lib/server/request-context"

export async function GET(request: NextRequest) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const archivedParam = request.nextUrl.searchParams.get("archived")
    const archived = archivedParam === null ? undefined : archivedParam === "true"
    const items = await inventoryRepo.list(ownerEmail, archived)
    return NextResponse.json(items)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const payload = await request.json()
    const created = await inventoryRepo.create(payload, ownerEmail)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
