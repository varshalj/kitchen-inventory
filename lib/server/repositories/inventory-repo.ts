import type { SupabaseClient } from "@supabase/supabase-js"
import type { InventoryItem } from "@/lib/types"

const TABLE = "inventory_items"

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
    partiallyConsumed: row.partially_consumed,
    notes: row.notes,
    price: row.price,
    brand: row.brand,
    archiveReason: row.archive_reason,
    orderedFrom: row.ordered_from,
    syncedFromEmail: row.synced_from_email,
    emailSource: row.email_source,
    rating: row.rating,
    reviewTags: row.review_tags,
    reviewNote: row.review_note,
    ratedAt: row.rated_at,
  }
}

export const inventoryRepo = {
  async list(
    supabase: SupabaseClient,
    archived?: boolean
  ): Promise<InventoryItem[]> {
    let query = supabase
      .from(TABLE)
      .select("*")
      .order("added_on", { ascending: false })

    if (archived !== undefined) {
      query = query.eq("archived", archived)
    }

    const { data, error } = await query

    if (error) throw error

    return data.map(toDomain)
  },

  async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<InventoryItem | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .limit(1)

    if (error) throw error

    return data?.[0] ? toDomain(data[0]) : null
  },

  async create(
    supabase: SupabaseClient,
    item: InventoryItem
  ): Promise<InventoryItem> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(item)
      .select()

    if (error) throw error

    return toDomain(data[0])
  },

  async update(
    supabase: SupabaseClient,
    id: string,
    item: Partial<InventoryItem>
  ): Promise<InventoryItem | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(item)
      .eq("id", id)
      .select()

    if (error) throw error

    return data?.[0] ? toDomain(data[0]) : null
  },

  async delete(
    supabase: SupabaseClient,
    id: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)

    if (error) throw error

    return true
  },
}
