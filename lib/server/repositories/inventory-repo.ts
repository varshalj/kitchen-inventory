import { supabaseServerClient } from "@/lib/server/supabase-server-client"
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

function toRecord(item: Partial<InventoryItem>, userId: string) {
  return {
    id: item.id,
    user_id: userId, // 🔥 critical
    name: item.name,
    category: item.category,
    expiry_date: item.expiryDate || null,
    location: item.location,
    quantity: item.quantity,
    archived: item.archived ?? false,
    added_on: item.addedOn,
    consumed_on: item.consumedOn,
    wasted_on: item.wastedOn,
    partially_consumed: item.partiallyConsumed,
    notes: item.notes,
    price: item.price,
    brand: item.brand,
    archive_reason: item.archiveReason,
    ordered_from: item.orderedFrom,
    synced_from_email: item.syncedFromEmail,
    email_source: item.emailSource,
    rating: item.rating,
    review_tags: item.reviewTags,
    review_note: item.reviewNote,
    rated_at: item.ratedAt,
  }
}

export const inventoryRepo = {
  async list(archived?: boolean): Promise<InventoryItem[]> {
    const query = archived === undefined
      ? `select=*&order=added_on.desc`
      : `select=*&archived=eq.${archived}&order=added_on.desc`

    const rows = await supabaseServerClient.select(TABLE, query)
    return rows.map(toDomain)
  },

  async getById(id: string): Promise<InventoryItem | null> {
    const rows = await supabaseServerClient.select(TABLE, `select=*&id=eq.${id}&limit=1`)
    return rows?.[0] ? toDomain(rows[0]) : null
  },

  async create(item: InventoryItem, userId: string): Promise<InventoryItem> {
    const rows = await supabaseServerClient.insert(TABLE, toRecord(item, userId))
    return toDomain(rows[0])
  },

  async update(id: string, item: Partial<InventoryItem>): Promise<InventoryItem | null> {
    const rows = await supabaseServerClient.update(TABLE, `id=eq.${id}`, item)
    return rows?.[0] ? toDomain(rows[0]) : null
  },

  async delete(id: string): Promise<boolean> {
    const rows = await supabaseServerClient.remove(TABLE, `id=eq.${id}`)
    return Array.isArray(rows) && rows.length > 0
  },
}
