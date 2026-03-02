import type { SupabaseClient } from "@supabase/supabase-js"
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

export const shoppingRepo = {
  async list(supabase: SupabaseClient): Promise<ShoppingItem[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("added_on", { ascending: false })

    if (error) throw error

    return data.map(toDomain)
  },

  async create(
    supabase: SupabaseClient,
    item: ShoppingItem
  ): Promise<ShoppingItem> {
    // merge if existing incomplete item exists
    const { data: existing, error: findError } = await supabase
      .from(TABLE)
      .select("*")
      .eq("name", item.name)
      .eq("completed", false)
      .limit(1)

    if (findError) throw findError

    if (existing?.[0]) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({
          quantity: (existing[0].quantity ?? 0) + item.quantity,
        })
        .eq("id", existing[0].id)
        .select()

      if (error) throw error
      return toDomain(data[0])
    }

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
    item: Partial<ShoppingItem>
  ): Promise<ShoppingItem | null> {
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
