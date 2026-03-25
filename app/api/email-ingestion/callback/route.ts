import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { emailIngestionRepo } from "@/lib/server/repositories/email-ingestion-repo"
import { normalizePayload, type NormalizedGroceryPayload } from "@/lib/server/email-normalizer"

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-email-secret") || ""
    const expectedSecret = process.env.EMAIL_CALLBACK_SECRET || ""

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const normalized = normalizePayload(body)
    const supabase = getSupabaseAdmin()

    // Lookup user by token
    const { data: userRow, error: lookupError } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("email_forwarding_token", normalized.token)
      .single()

    if (lookupError || !userRow) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 })
    }

    const userId = (userRow as any).user_id as string

    if (normalized.discarded) {
      const row = await emailIngestionRepo.create(supabase, {
        id: crypto.randomUUID(),
        user_id: userId,
        platform: null,
        order_id: null,
        status: "skipped",
        error_message: null,
        sender_email: normalized.senderEmail,
        subject: normalized.subject,
        parsed_items: null,
        item_count: 0,
        order_total: null,
        order_date: null,
        confidence: null,
      })
      return NextResponse.json({ ok: true, ingestionId: row.id, status: "skipped" })
    }

    const grocery = normalized as NormalizedGroceryPayload

    // Dedup by order_id
    if (grocery.orderId) {
      const existing = await emailIngestionRepo.findByOrderId(supabase, userId, grocery.orderId)
      if (existing) {
        return NextResponse.json({ ok: true, duplicate: true, existingId: existing.id })
      }
    }

    const row = await emailIngestionRepo.create(supabase, {
      id: crypto.randomUUID(),
      user_id: userId,
      platform: grocery.platform,
      order_id: grocery.orderId,
      status: "ready",
      error_message: null,
      sender_email: grocery.senderEmail,
      subject: grocery.subject,
      parsed_items: grocery.items,
      item_count: grocery.items.length,
      order_total: grocery.orderTotal,
      order_date: grocery.orderDate,
      confidence: grocery.confidence,
    })

    return NextResponse.json({ ok: true, ingestionId: row.id, status: "ready" })
  } catch (error) {
    console.error("EMAIL INGESTION CALLBACK ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
