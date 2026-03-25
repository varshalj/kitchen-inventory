import type { SupabaseClient } from "@supabase/supabase-js"

const TABLE = "email_ingestions"

export interface EmailIngestionRow {
  id: string
  user_id: string
  platform: string | null
  order_id: string | null
  status: "ready" | "saved" | "failed" | "dismissed" | "skipped"
  error_message: string | null
  sender_email: string | null
  subject: string | null
  parsed_items: any[] | null
  item_count: number
  order_total: string | null
  order_date: string | null
  confidence: number | null
  created_at: string
  updated_at: string
}

export const emailIngestionRepo = {
  async create(supabase: SupabaseClient, row: Omit<EmailIngestionRow, "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select()
      .single()

    if (error) throw error
    return data as EmailIngestionRow
  },

  async findByOrderId(supabase: SupabaseClient, userId: string, orderId: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, status")
      .eq("user_id", userId)
      .eq("order_id", orderId)
      .limit(1)

    if (error) throw error
    return data?.[0] ?? null
  },

  async listPending(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .in("status", ["ready", "failed", "skipped"])
      .order("created_at", { ascending: false })

    if (error) throw error
    return (data ?? []) as EmailIngestionRow[]
  },

  async updateStatus(
    supabase: SupabaseClient,
    id: string,
    userId: string,
    status: EmailIngestionRow["status"],
    extra?: Partial<Pick<EmailIngestionRow, "error_message">>,
  ) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) throw error
    return data as EmailIngestionRow
  },

  async autoDismissStale(supabase: SupabaseClient, userId: string, staleDays = 7) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - staleDays)

    const { error } = await supabase
      .from(TABLE)
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("status", ["ready", "skipped"])
      .lt("created_at", cutoff.toISOString())

    if (error) throw error
  },
}
