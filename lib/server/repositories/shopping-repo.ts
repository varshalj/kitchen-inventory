import { supabaseServerClient } from "@/lib/server/supabase-server-client"
import type { ShoppingItem } from "@/lib/types"

const TABLE = "shopping_items"
const encode = encodeURIComponent

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

function toRecord(item: Partial<ShoppingItem>) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    category: item.category,
    notes: item.notes,
    completed: item.completed,
    added_on: item.addedOn,
    added_from: item.addedFrom,
  }
}

export const shoppingRepo = {
  async list(ownerEmail: string): Promise<ShoppingItem[]> {
    const rows = await supabaseServerClient.select(TABLE, `select=*&owner_email=eq.${encode(ownerEmail)}&order=added_on.desc`)
    return rows.map(toDomain)
  },

  async create(item: ShoppingItem, ownerEmail: string): Promise<ShoppingItem> {
    const existing = await supabaseServerClient.select(TABLE, `select=*&owner_email=eq.${encode(ownerEmail)}&name=eq.${encode(item.name)}&completed=eq.false&limit=1`)

    if (existing?.[0]) {
      const merged = await supabaseServerClient.update(TABLE, `id=eq.${encode(existing[0].id)}&owner_email=eq.${encode(ownerEmail)}`, {
        quantity: (existing[0].quantity ?? 0) + item.quantity,
      })
      return toDomain(merged[0])
    }

    const rows = await supabaseServerClient.insert(TABLE, { ...toRecord(item), owner_email: ownerEmail })
    return toDomain(rows[0])
  },

  async update(id: string, ownerEmail: string, item: Partial<ShoppingItem>): Promise<ShoppingItem | null> {
    const rows = await supabaseServerClient.update(TABLE, `id=eq.${encode(id)}&owner_email=eq.${encode(ownerEmail)}`, toRecord(item))
    return rows?.[0] ? toDomain(rows[0]) : null
  },

  async delete(id: string, ownerEmail: string): Promise<boolean> {
    const rows = await supabaseServerClient.remove(TABLE, `id=eq.${encode(id)}&owner_email=eq.${encode(ownerEmail)}`)
    return Array.isArray(rows) && rows.length > 0
  },
}
