import { NextRequest, NextResponse } from "next/server"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

export async function GET(request: NextRequest) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const items = await shoppingRepo.list(ownerEmail)
    return NextResponse.json(items)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerEmail = getOwnerEmail(request)
    const payload = await request.json()
    const created = await shoppingRepo.create(payload, ownerEmail)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
