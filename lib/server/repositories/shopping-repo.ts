import { supabaseServerClient } from "@/lib/server/supabase-server-client"
import type { ShoppingItem } from "@/lib/types"

const TABLE = "shopping_items"

function toDomain(row: any): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    notes: row.notes,
    completed: row.completed,
    addedOn: row.added_on,
    addedFrom: row.added_from,
  }
}

function toRecord(item: Partial<ShoppingItem>, userId: string) {
  return {
    id: item.id,
    user_id: userId, // 🔥 critical
    name: item.name,
    quantity: item.quantity,
    category: item.category,
    notes: item.notes,
    completed: item.completed ?? false,
    added_on: item.addedOn,
    added_from: item.addedFrom,
  }
}

export const shoppingRepo = {
  async list(): Promise<ShoppingItem[]> {
    const rows = await supabaseServerClient.select(
      TABLE,
      `select=*&order=added_on.desc`
    )
    return rows.map(toDomain)
  },

  async create(item: ShoppingItem, userId: string): Promise<ShoppingItem> {
    const existing = await supabaseServerClient.select(
      TABLE,
      `select=*&name=eq.${item.name}&completed=eq.false&limit=1`
    )

    if (existing?.[0]) {
      const merged = await supabaseServerClient.update(
        TABLE,
        `id=eq.${existing[0].id}`,
        { quantity: (existing[0].quantity ?? 0) + item.quantity }
      )
      return toDomain(merged[0])
    }

    const rows = await supabaseServerClient.insert(
      TABLE,
      toRecord(item, userId)
    )

    return toDomain(rows[0])
  },

  async update(id: string, item: Partial<ShoppingItem>): Promise<ShoppingItem | null> {
    const rows = await supabaseServerClient.update(
      TABLE,
      `id=eq.${id}`,
      item
    )

    return rows?.[0] ? toDomain(rows[0]) : null
  },

  async delete(id: string): Promise<boolean> {
    const rows = await supabaseServerClient.remove(
      TABLE,
      `id=eq.${id}`
    )

    return Array.isArray(rows) && rows.length > 0
  },
}
