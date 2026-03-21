import type { SupabaseClient } from "@supabase/supabase-js"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"
import { recipeRepo } from "@/lib/server/repositories/recipe-repo"

type ToolResult = { content: Array<{ type: "text"; text: string }> }

function textResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}

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
