import type { SupabaseClient } from "@supabase/supabase-js"
import type { ShoppingItem } from "@/lib/types"
import { normalizeName } from "@/lib/utils"

const TABLE = "shopping_items"

/* ----------------------------- */
/* Domain → DB Mapper            */
/* ----------------------------- */

function toDb(item: Partial<ShoppingItem>) {
  const payload: any = {}

  if (item.name !== undefined) payload.name = item.name
  if (item.quantity !== undefined) payload.quantity = item.quantity
  if (item.unit !== undefined) payload.unit = item.unit
  if (item.category !== undefined) payload.category = item.category
  if (item.notes !== undefined) payload.notes = item.notes
  if (item.completed !== undefined) payload.completed = item.completed
  if (item.addedOn !== undefined) payload.added_on = item.addedOn
  if (item.addedFrom !== undefined) payload.added_from = item.addedFrom
  if (item.brand !== undefined) payload.brand = item.brand
  if (item.orderedFrom !== undefined) payload.ordered_from = item.orderedFrom
  // SLM-readiness provenance — see migration 202605270001.
  if (item.aiInteractionId !== undefined) payload.ai_interaction_id = item.aiInteractionId
  if (item.nameRaw !== undefined) payload.name_raw = item.nameRaw
  if (item.quantityRaw !== undefined) payload.quantity_raw = item.quantityRaw
  if (item.extractedExtras !== undefined) payload.extracted_extras = item.extractedExtras

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
    unit: row.unit ?? undefined,
    category: row.category,
    notes: row.notes,
    completed: row.completed,
    addedOn: row.added_on,
    addedFrom: row.added_from,
    brand: row.brand ?? undefined,
    orderedFrom: row.ordered_from ?? undefined,
    aiInteractionId: row.ai_interaction_id ?? null,
    nameRaw: row.name_raw ?? null,
    quantityRaw: row.quantity_raw ?? null,
    extractedExtras: row.extracted_extras ?? null,
  }
}

/* ----------------------------- */
/* Repository                    */
/* ----------------------------- */

export const shoppingRepo = {
  async list(supabase: SupabaseClient) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", user.id)
      .order("added_on", { ascending: false })

    if (error) throw error

    return (data ?? []).map(toDomain)
  },


  async getById(supabase: SupabaseClient, id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1)

    if (error) throw error
    return data?.[0] ? toDomain(data[0]) : null
  },
  async create(supabase: SupabaseClient, item: ShoppingItem) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Roll-up: merge into an existing ACTIVE item with the same normalized name
    // (so "Onion"/"onions"/"Onions" collapse into one row) AND a matching unit.
    // Different units stay separate — we don't sum 2 kg with 3 pcs. Matching is
    // conservative (normalized-exact), so it only ever under-merges, never
    // combines genuinely different products ("tomato" vs "local tomato").
    const target = normalizeName(item.name)
    const incomingUnit = item.unit ?? null

    const { data: activeItems, error: findError } = await supabase
      .from(TABLE)
      .select("*")
      .eq("completed", false)
      .eq("user_id", user.id)

    if (findError) throw findError

    const mergeTarget = (activeItems ?? []).find(
      (r) => normalizeName(r.name) === target && (r.unit ?? null) === incomingUnit,
    )

    if (mergeTarget) {
      const mergedQuantity = (mergeTarget.quantity ?? 0) + (item.quantity ?? 1)
      const { data: updated, error: updateError } = await supabase
        .from(TABLE)
        .update({ quantity: mergedQuantity })
        .eq("id", mergeTarget.id)
        .eq("user_id", user.id)
        .select()

      if (updateError) throw updateError
      if (!updated?.[0]) {
        throw new Error("Update blocked by RLS")
      }

      return toDomain(updated[0])
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        id: crypto.randomUUID(),
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
      .eq("user_id", user.id)
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
      .eq("user_id", user.id)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error("Delete blocked by RLS")
    }

    return true
  },
}
