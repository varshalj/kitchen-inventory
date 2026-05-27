import type { SupabaseClient } from "@supabase/supabase-js"
import type { ShoppingItem } from "@/lib/types"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"
import { recipeRepo } from "@/lib/server/repositories/recipe-repo"
import { normalizeName } from "@/lib/utils"

type ToolResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: unknown
  isError?: boolean
}

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function errorResult(data: unknown): ToolResult {
  // Intentionally omit structuredContent on errors — outputSchema describes the
  // success/dry-run shape, and errors shouldn't have to satisfy it.
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: true }
}

function previewResult(payload: Record<string, unknown>): ToolResult {
  return textResult({ dry_run: true, ...payload })
}

// normalizeName moved to lib/utils.ts so it can be shared with the dashboard's
// thread-clustering logic. Imported above.

// ─── Tool handlers ───────────────────────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  switch (toolName) {
    case "list_inventory":
      return handleListInventory(args, supabase)
    case "get_expiring_soon":
      return handleGetExpiringSoon(args, supabase)
    case "list_shopping":
      return handleListShopping(args, supabase)
    case "list_recipes":
      return handleListRecipes(supabase)
    case "get_recipe":
      return handleGetRecipe(args, supabase)
    case "suggest_meals":
      return handleSuggestMeals(args, supabase)
    case "get_waste_stats":
      return handleGetWasteStats(args, supabase)
    case "search_inventory":
      return handleSearchInventory(args, supabase)
    case "add_to_shopping_list":
      return handleAddToShoppingList(args, supabase)
    case "mark_as_consumed":
      return handleMarkAsConsumed(args, supabase)
    case "remove_from_shopping_list":
      return handleRemoveFromShoppingList(args, supabase)
    case "update_shopping_item":
      return handleUpdateShoppingItem(args, supabase)
    default:
      return textResult({ error: `Unknown tool: ${toolName}` })
  }
}

async function handleListInventory(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  let items = await inventoryRepo.list(supabase, false)

  if (args.category && typeof args.category === "string") {
    const cat = args.category.toLowerCase()
    items = items.filter((i) => i.category?.toLowerCase() === cat)
  }
  if (args.location && typeof args.location === "string") {
    const loc = args.location.toLowerCase()
    items = items.filter((i) => i.location?.toLowerCase() === loc)
  }

  return textResult({
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      unit: i.unit,
      expiryDate: i.expiryDate,
      location: i.location,
      brand: i.brand,
      addedOn: i.addedOn,
      notes: i.notes,
    })),
  })
}

async function handleGetExpiringSoon(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const days = typeof args.days === "number" ? args.days : 3
  const items = await inventoryRepo.list(supabase, false)
  const now = new Date()
  const cutoff = new Date(now.getTime() + days * 86400000)

  const expiring = items
    .filter((i) => {
      if (!i.expiryDate) return false
      const exp = new Date(i.expiryDate)
      return exp <= cutoff
    })
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
    .map((i) => {
      const daysLeft = Math.ceil(
        (new Date(i.expiryDate).getTime() - now.getTime()) / 86400000,
      )
      return {
        id: i.id,
        name: i.name,
        category: i.category,
        expiryDate: i.expiryDate,
        daysLeft,
        quantity: i.quantity,
        unit: i.unit,
        location: i.location,
      }
    })

  return textResult({ days, count: expiring.length, items: expiring })
}

async function handleListShopping(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const status = typeof args.status === "string" ? args.status : "pending"
  let items = await shoppingRepo.list(supabase)

  if (status === "pending") {
    items = items.filter((i) => !i.completed)
  } else if (status === "completed") {
    items = items.filter((i) => i.completed)
  }

  return textResult({
    status,
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      completed: i.completed,
      addedFrom: i.addedFrom,
      brand: i.brand,
      notes: i.notes,
    })),
  })
}

async function handleListRecipes(supabase: SupabaseClient): Promise<ToolResult> {
  const recipes = await recipeRepo.list(supabase)

  return textResult({
    count: recipes.length,
    recipes: recipes.map((r) => ({
      id: r.id,
      title: r.title,
      sourceUrl: r.sourceUrl,
      sourcePlatform: r.sourcePlatform,
      servings: r.servings,
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      totalTimeMinutes: r.totalTimeMinutes,
      pantryScore: r.pantryCompatibilityScore,
      isBookmark: r.isBookmark,
    })),
  })
}

async function handleGetRecipe(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const recipeId = args.recipe_id as string
  if (!recipeId) return textResult({ error: "recipe_id is required" })

  const result = await recipeRepo.getById(supabase, recipeId)
  if (!result) return textResult({ error: "Recipe not found" })

  return textResult({
    recipe: {
      id: result.recipe.id,
      title: result.recipe.title,
      sourceUrl: result.recipe.sourceUrl,
      servings: result.recipe.servings,
      prepTimeMinutes: result.recipe.prepTimeMinutes,
      cookTimeMinutes: result.recipe.cookTimeMinutes,
      totalTimeMinutes: result.recipe.totalTimeMinutes,
      instructions: result.recipe.instructions,
      notes: result.recipe.notes,
      imageUrl: result.recipe.imageUrl,
    },
    ingredients: result.ingredients.map((ing) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      optional: ing.optional,
      preparation: ing.preparation,
      group: ing.ingredientGroup,
    })),
  })
}

async function handleSuggestMeals(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const limit = typeof args.limit === "number" ? args.limit : 5
  const recipes = await recipeRepo.list(supabase)

  const sorted = recipes
    .filter((r) => !r.isBookmark)
    .sort(
      (a, b) =>
        (b.pantryCompatibilityScore ?? 0) - (a.pantryCompatibilityScore ?? 0),
    )
    .slice(0, limit)

  return textResult({
    count: sorted.length,
    suggestions: sorted.map((r) => ({
      id: r.id,
      title: r.title,
      pantryScore: r.pantryCompatibilityScore,
      servings: r.servings,
      totalTimeMinutes: r.totalTimeMinutes,
      sourceUrl: r.sourceUrl,
    })),
  })
}

async function handleGetWasteStats(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const days = typeof args.days === "number" ? args.days : 30
  const items = await inventoryRepo.list(supabase, true)
  const cutoff = new Date(Date.now() - days * 86400000)

  const wasted = items.filter(
    (i) =>
      i.archiveReason === "wasted" &&
      i.wastedOn &&
      new Date(i.wastedOn) >= cutoff,
  )

  const byCategory: Record<string, number> = {}
  const byReason: Record<string, number> = {}

  for (const item of wasted) {
    const cat = item.category || "uncategorized"
    byCategory[cat] = (byCategory[cat] || 0) + 1

    const reason = item.wastageReason || "unknown"
    byReason[reason] = (byReason[reason] || 0) + 1
  }

  return textResult({
    periodDays: days,
    totalWasted: wasted.length,
    byCategory,
    byReason,
    recentItems: wasted.slice(0, 10).map((i) => ({
      name: i.name,
      category: i.category,
      reason: i.wastageReason,
      wastedOn: i.wastedOn,
      price: i.price,
    })),
  })
}

async function handleSearchInventory(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const query = (args.query as string)?.toLowerCase()
  if (!query) return textResult({ error: "query is required" })

  const [current, archived] = await Promise.all([
    inventoryRepo.list(supabase, false),
    inventoryRepo.list(supabase, true),
  ])

  const all = [...current, ...archived]
  const matches = all.filter((i) => i.name.toLowerCase().includes(query))

  return textResult({
    query,
    count: matches.length,
    items: matches.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      unit: i.unit,
      expiryDate: i.expiryDate,
      location: i.location,
      archived: i.archived,
      archiveReason: i.archiveReason,
    })),
  })
}

async function handleAddToShoppingList(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const itemName = typeof args.item_name === "string" ? args.item_name.trim() : ""
  if (!itemName) return errorResult({ error: "invalid_input", message: "item_name is required" })

  const quantity =
    typeof args.quantity === "number" && args.quantity > 0 ? args.quantity : 1
  // Default to 'pcs' rather than undefined — shopping_items.unit is NOT NULL
  // at the DB level (migration 202605270002), and undefined would also be a
  // bug if it slipped past validation.
  const unit = typeof args.unit === "string" && args.unit.length > 0 ? args.unit : "pcs"
  const confirm = args.confirm === true

  const target = normalizeName(itemName)
  const all = await shoppingRepo.list(supabase)
  const candidate = all.find(
    (i) =>
      !i.completed &&
      normalizeName(i.name) === target &&
      (i.unit ?? null) === (unit ?? null),
  )

  if (!confirm) {
    if (candidate) {
      return previewResult({
        tool: "add_to_shopping_list",
        would: {
          action: "merge_with_existing",
          existing: {
            id: candidate.id,
            name: candidate.name,
            quantity: candidate.quantity,
            unit: candidate.unit,
          },
          new_quantity: candidate.quantity + quantity,
        },
        next_step: "Call again with the same arguments plus confirm: true to execute.",
      })
    }
    return previewResult({
      tool: "add_to_shopping_list",
      would: { action: "insert_new", item: { name: itemName, quantity, unit } },
      next_step: "Call again with the same arguments plus confirm: true to execute.",
    })
  }

  if (candidate) {
    const updated = await shoppingRepo.update(supabase, candidate.id, {
      quantity: candidate.quantity + quantity,
    })
    return textResult({
      ok: true,
      merged: true,
      previous_quantity: candidate.quantity,
      item: {
        id: updated.id,
        name: updated.name,
        quantity: updated.quantity,
        unit: updated.unit,
        completed: updated.completed,
      },
    })
  }

  const created = await shoppingRepo.create(supabase, {
    id: crypto.randomUUID(),
    name: itemName,
    quantity,
    unit,
    completed: false,
    addedOn: new Date().toISOString(),
    addedFrom: "agent",
  })
  return textResult({
    ok: true,
    merged: false,
    item: {
      id: created.id,
      name: created.name,
      quantity: created.quantity,
      unit: created.unit,
      completed: created.completed,
    },
  })
}

async function handleMarkAsConsumed(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const itemName = typeof args.item_name === "string" ? args.item_name.trim() : ""
  if (!itemName) return errorResult({ error: "invalid_input", message: "item_name is required" })

  const requestedQty =
    typeof args.quantity === "number" && args.quantity > 0 ? args.quantity : undefined
  const confirm = args.confirm === true

  const items = await inventoryRepo.list(supabase, false)
  const target = normalizeName(itemName)
  const matches = items.filter((i) => normalizeName(i.name) === target)

  if (matches.length === 0) {
    return errorResult({
      error: "not_found",
      item_name: itemName,
      normalized: target,
      message: `No active inventory item matches '${itemName}' (normalized: '${target}'). Suggest checking spelling, or call add_to_shopping_list if the user wants to restock it anyway.`,
    })
  }

  if (matches.length > 1) {
    return errorResult({
      error: "ambiguous",
      item_name: itemName,
      normalized: target,
      message: `${matches.length} active inventory items match '${itemName}' (normalized: '${target}'). Ask the user which one to mark consumed and pass its id via item_id (not yet supported — for now disambiguate by passing the exact stored name).`,
      candidates: matches.map((m) => ({
        id: m.id,
        name: m.name,
        brand: m.brand,
        quantity: m.quantity,
        unit: m.unit,
        expiry_date: m.expiryDate,
        location: m.location,
      })),
    })
  }

  const item = matches[0]
  const restockQuantity =
    requestedQty ?? (item.quantity && item.quantity > 0 ? item.quantity : 1)

  if (!confirm) {
    return previewResult({
      tool: "mark_as_consumed",
      would: {
        action: "archive_and_restock",
        consume: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          brand: item.brand,
          expiry_date: item.expiryDate,
        },
        restock: {
          quantity: restockQuantity,
          unit: item.unit,
          added_from: "consumed",
        },
      },
      next_step: "Call again with the same arguments plus confirm: true to execute.",
    })
  }

  const updated = await inventoryRepo.update(supabase, item.id, {
    quantity: 0,
    archived: true,
    archiveReason: "consumed",
    consumedOn: new Date().toISOString(),
  })

  const restocked = await shoppingRepo.create(supabase, {
    id: crypto.randomUUID(),
    name: item.name,
    quantity: restockQuantity,
    unit: item.unit,
    category: item.category,
    completed: false,
    addedOn: new Date().toISOString(),
    addedFrom: "consumed",
    brand: item.brand,
    orderedFrom: item.orderedFrom,
  })

  return textResult({
    ok: true,
    consumed: {
      id: updated.id,
      name: updated.name,
      consumed_on: updated.consumedOn,
    },
    restocked: {
      id: restocked.id,
      name: restocked.name,
      quantity: restocked.quantity,
      unit: restocked.unit,
      added_from: "consumed",
    },
  })
}

// ─── Shopping-list lifecycle: shared resolver + handlers ─────────────────────

async function resolveShoppingItem(
  supabase: SupabaseClient,
  itemId: string | undefined,
  itemName: string | undefined,
): Promise<{ item: ShoppingItem } | { error: ToolResult }> {
  if (itemId) {
    const item = await shoppingRepo.getById(supabase, itemId)
    if (!item) {
      return {
        error: errorResult({
          error: "not_found",
          item_id: itemId,
          message: `No shopping item with id '${itemId}'.`,
        }),
      }
    }
    return { item }
  }

  if (!itemName) {
    return {
      error: errorResult({
        error: "invalid_input",
        message: "Either item_id or item_name is required.",
      }),
    }
  }

  const target = normalizeName(itemName)
  const items = await shoppingRepo.list(supabase)
  const matches = items.filter(
    (i) => !i.completed && normalizeName(i.name) === target,
  )

  if (matches.length === 0) {
    return {
      error: errorResult({
        error: "not_found",
        item_name: itemName,
        normalized: target,
        message: `No active shopping item matches '${itemName}' (normalized: '${target}').`,
      }),
    }
  }

  if (matches.length > 1) {
    return {
      error: errorResult({
        error: "ambiguous",
        item_name: itemName,
        normalized: target,
        message: `${matches.length} active shopping items match '${itemName}'. Ask the user which one, or call again with item_id.`,
        candidates: matches.map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          brand: m.brand,
        })),
      }),
    }
  }

  return { item: matches[0] }
}

async function handleRemoveFromShoppingList(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const itemId = typeof args.item_id === "string" ? args.item_id : undefined
  const itemName = typeof args.item_name === "string" ? args.item_name.trim() : undefined
  const confirm = args.confirm === true

  const resolved = await resolveShoppingItem(supabase, itemId, itemName)
  if ("error" in resolved) return resolved.error
  const { item } = resolved

  if (!confirm) {
    return previewResult({
      tool: "remove_from_shopping_list",
      would: {
        action: "delete",
        item: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        },
      },
      next_step: "Call again with the same arguments plus confirm: true to execute.",
    })
  }

  await shoppingRepo.delete(supabase, item.id)
  return textResult({
    ok: true,
    removed: { id: item.id, name: item.name, quantity: item.quantity, unit: item.unit },
  })
}

async function handleUpdateShoppingItem(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const itemId = typeof args.item_id === "string" ? args.item_id : undefined
  const itemName = typeof args.item_name === "string" ? args.item_name.trim() : undefined
  const confirm = args.confirm === true

  const updates: Partial<ShoppingItem> = {}
  if (typeof args.quantity === "number" && args.quantity >= 0) updates.quantity = args.quantity
  if (typeof args.unit === "string") updates.unit = args.unit
  if (typeof args.completed === "boolean") updates.completed = args.completed
  if (typeof args.notes === "string") updates.notes = args.notes

  if (Object.keys(updates).length === 0) {
    return errorResult({
      error: "invalid_input",
      message: "At least one field to update is required (quantity, unit, completed, notes).",
    })
  }

  const resolved = await resolveShoppingItem(supabase, itemId, itemName)
  if ("error" in resolved) return resolved.error
  const { item } = resolved

  if (!confirm) {
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      changes[key] = { from: item[key], to: updates[key] }
    }
    return previewResult({
      tool: "update_shopping_item",
      would: {
        action: "update",
        item: { id: item.id, name: item.name },
        changes,
      },
      next_step: "Call again with the same arguments plus confirm: true to execute.",
    })
  }

  const updated = await shoppingRepo.update(supabase, item.id, updates)
  return textResult({
    ok: true,
    updated: {
      id: updated.id,
      name: updated.name,
      quantity: updated.quantity,
      unit: updated.unit,
      completed: updated.completed,
      notes: updated.notes,
    },
  })
}
