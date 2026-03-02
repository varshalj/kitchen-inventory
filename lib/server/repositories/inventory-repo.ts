import type { SupabaseClient } from "@supabase/supabase-js"
import type { InventoryItem } from "@/lib/types"

const TABLE = "inventory_items"

/* ----------------------------- */
/* Domain → DB Mapper            */
/* ----------------------------- */

function toDb(item: Partial<InventoryItem>) {
  const payload: any = {}

  if (item.id !== undefined) payload.id = item.id
  if (item.name !== undefined) payload.name = item.name
  if (item.category !== undefined) payload.category = item.category
  if (item.expiryDate !== undefined) payload.expiry_date = item.expiryDate || null
  if (item.location !== undefined) payload.location = item.location
  if (item.quantity !== undefined) payload.quantity = item.quantity
  if (item.archived !== undefined) payload.archived = item.archived
  if (item.consumedOn !== undefined) payload.consumed_on = item.consumedOn
  if (item.wastedOn !== undefined) payload.wasted_on = item.wastedOn
  if (item.archiveReason !== undefined) payload.archive_reason = item.archiveReason
  if (item.notes !== undefined) payload.notes = item.notes
  if (item.price !== undefined) payload.price = item.price
  if (item.brand !== undefined) payload.brand = item.brand
  if (item.orderedFrom !== undefined) payload.ordered_from = item.orderedFrom
  if (item.syncedFromEmail !== undefined) payload.synced_from_email = item.syncedFromEmail
  if (item.emailSource !== undefined) payload.email_source = item.emailSource
  if (item.rating !== undefined) payload.rating = item.rating
  if (item.reviewTags !== undefined) payload.review_tags = item.reviewTags
  if (item.reviewNote !== undefined) payload.review_note = item.reviewNote
  if (item.ratedAt !== undefined) payload.rated_at = item.ratedAt

  return payload
}

/* ----------------------------- */
/* DB → Domain Mapper            */
/* ----------------------------- */

function toDomain(row: any): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    expiryDate: row.expiry_date ?? "",
    location: row.location,
    quantity: row.quantity,
    archived: row.archived,
    addedOn: row.added_on,
    consumedOn: row.consumed_on,
    wastedOn: row.wasted_on,
    archiveReason: row.archive_reason,
    notes: row.notes,
    price: row.price,
    brand: row.brand,
    orderedFrom: row.ordered_from,
    syncedFromEmail: row.synced_from_email,
    emailSource: row.email_source,
    rating: row.rating,
    reviewTags: row.review_tags,
    reviewNote: row.review_note,
    ratedAt: row.rated_at,
  }
}

/* ----------------------------- */
/* Repository                    */
/* ----------------------------- */

export const inventoryRepo = {
  async list(supabase: SupabaseClient, archived?: boolean) {
    let query = supabase
      .from(TABLE)
      .select("*")
      .order("added_on", { ascending: false })

    if (archived !== undefined) {
      query = query.eq("archived", archived)
    }

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map(toDomain)
  },

  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .limit(1)

    if (error) throw error
    return data?.[0] ? toDomain(data[0]) : null
  },

  async create(supabase: SupabaseClient, item: InventoryItem) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    const dbPayload = {
      ...toDb(item),
      user_id: user.id, // 🔥 CRITICAL FOR RLS
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(dbPayload)
      .select()

    if (error) throw error
    if (!data?.[0]) throw new Error("Insert failed")

    return toDomain(data[0])
  },

  async update(supabase: SupabaseClient, id: string, item: Partial<InventoryItem>) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(toDb(item))
      .eq("id", id)
      .select()

    if (error) throw error
    return data?.[0] ? toDomain(data[0]) : null
  },

async delete(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select()

  if (error) throw error

  if (!data || data.length === 0) {
    throw new Error("Delete blocked by RLS")
  }

  return true
},
}
