import type { SupabaseClient } from "@supabase/supabase-js"
import type { ShoppingItem } from "@/lib/types"

const TABLE = "shopping_items"

/* ----------------------------- */
/* Domain → DB Mapper            */
/* ----------------------------- */

function toDb(item: Partial<ShoppingItem>) {
  const payload: any = {}

  if (item.name !== undefined) payload.name = item.name
  if (item.quantity !== undefined) payload.quantity = item.quantity
  if (item.category !== undefined) payload.category = item.category
  if (item.notes !== undefined) payload.notes = item.notes
  if (item.completed !== undefined) payload.completed = item.completed
  if (item.addedOn !== undefined) payload.added_on = item.addedOn
  if (item.addedFrom !== undefined) payload.added_from = item.addedFrom

  return payload
}

/* ----------------------------- */
/* DB → Domain Mapper            */
/* ----------------------------- */

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

/* ----------------------------- */
/* Repository                    */
/* ----------------------------- */

export const shoppingRepo = {
  async list(supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("added_on", { ascending: false })

    if (error) throw error

    return (data ?? []).map(toDomain)
  },

  async create(supabase: SupabaseClient, item: ShoppingItem) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // 🔥 Check existing unfinished item for THIS USER ONLY
    const { data: existing, error: findError } = await supabase
      .from(TABLE)
      .select("*")
      .eq("name", item.name)
      .eq("completed", false)
      .eq("user_id", user.id)   // 🔥 CRITICAL FIX
      .limit(1)

    if (findError) throw findError

    if (existing?.[0]) {
      const mergedQuantity =
        (existing[0].quantity ?? 0) + (item.quantity ?? 1)

      const { data: updated, error: updateError } = await supabase
        .from(TABLE)
        .update({ quantity: mergedQuantity })
        .eq("id", existing[0].id)
        .eq("user_id", user.id)   // 🔥 CRITICAL FIX
        .select()

      if (updateError) throw updateError
      if (!updated?.[0]) {
        throw new Error("Update blocked by RLS")
      }

      return toDomain(updated[0])
    }

    // 🔥 Insert new row with user_id
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        ...toDb(item),
        user_id: user.id,
      })
      .select()

    if (error) throw error
    if (!data?.[0]) throw new Error("Insert failed")

    return toDomain(data[0])
  },

  async update(
    supabase: SupabaseClient,
    id: string,
    item: Partial<ShoppingItem>
  ) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase
      .from(TABLE)
      .update(toDb(item))
      .eq("id", id)
      .eq("user_id", user.id)   // 🔥 CRITICAL FIX
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error("Update blocked by RLS or item not found")
    }

    return toDomain(data[0])
  },

  async delete(supabase: SupabaseClient, id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)   // 🔥 CRITICAL FIX
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error("Delete blocked by RLS")
    }

    return true
  },
}
