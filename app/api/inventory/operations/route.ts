import { NextResponse } from "next/server"
import { processInventoryOperation } from "@/lib/data"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itemId?: string
      action?: "consume" | "waste"
      addToShoppingList?: boolean
    }

    if (!body.itemId || (body.action !== "consume" && body.action !== "waste")) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const result = processInventoryOperation({
      itemId: body.itemId,
      action: body.action,
      addToShoppingList: body.addToShoppingList,
    })

    if (!result) {
      return NextResponse.json({ error: "Unable to process inventory operation" }, { status: 404 })
    }

    return NextResponse.json({
      status: "success",
      message: `Item marked as ${body.action}`,
      ...result,
    })
  } catch {
    return NextResponse.json({ status: "error", error: "Failed to process inventory operation" }, { status: 500 })
  }
}
