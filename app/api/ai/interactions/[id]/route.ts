import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/server/require-user"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

/**
 * PATCH /api/ai/interactions/[id]
 *
 * Finalises an ai_interactions row after the user has reviewed the model's
 * proposals and saved (or rejected) them. Stores the approved payload (leg c
 * of the SLM training triplet) and the had_corrections flag for fast filtering.
 *
 * The client computes had_corrections by diffing approvedPayload against the
 * original proposals it received from the AI route. Server trusts the client
 * on this — it's a coarse signal, not a security boundary.
 */
const bodySchema = z.object({
  approvedPayload: z.unknown(),
  hadCorrections: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid interaction id" }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  // Use service-role client because logAIInteraction also uses it; the
  // user_id eq filter below enforces ownership.
  const admin = getSupabaseAdmin() as any

  try {
    const { data, error } = await admin
      .from("ai_interactions")
      .update({
        approved_payload: parsed.data.approvedPayload ?? null,
        had_corrections: parsed.data.hadCorrections ?? null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")

    if (error) {
      console.error("ai_interactions finalize failed:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      // Row doesn't exist or belongs to a different user — don't leak which.
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ id: data[0].id }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
