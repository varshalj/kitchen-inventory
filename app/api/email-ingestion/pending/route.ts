import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { emailIngestionRepo } from "@/lib/server/repositories/email-ingestion-repo"

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Auto-dismiss stale ingestions older than 7 days
    await emailIngestionRepo.autoDismissStale(supabase, user.id)

    const rows = await emailIngestionRepo.listPending(supabase, user.id)

    return NextResponse.json({ ingestions: rows })
  } catch (error) {
    console.error("GET /api/email-ingestion/pending error:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
