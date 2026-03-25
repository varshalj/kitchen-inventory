import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { emailIngestionRepo } from "@/lib/server/repositories/email-ingestion-repo"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status } = body as { status: "saved" | "dismissed" }

    if (!["saved", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const updated = await emailIngestionRepo.updateStatus(supabase, id, user.id, status)

    return NextResponse.json({ ok: true, ingestion: updated })
  } catch (error) {
    console.error("PATCH /api/email-ingestion/[id] error:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
