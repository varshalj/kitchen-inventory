import { NextResponse } from "next/server"
import { undoInventoryOperation } from "@/lib/data"

export async function PATCH(_: Request, { params }: { params: { receiptId: string } }) {
  const result = undoInventoryOperation(params.receiptId)

  if (!result) {
    return NextResponse.json({ status: "error", error: "Undo not available for this receipt" }, { status: 400 })
  }

  return NextResponse.json({
    status: "success",
    message: "Operation reverted",
    ...result,
  })
}
