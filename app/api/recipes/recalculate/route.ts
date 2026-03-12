import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeRepo } from "@/lib/server/repositories/recipe-repo"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { computePantryMatches, computeCompatibilityScore } from "@/lib/server/pantry-match"
import type { ParsedIngredient } from "@/lib/types"

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch all user's recipes
    const recipes = await recipeRepo.list(supabase)

    // Fetch pantry once (shared for all recipes)
    const pantryItems = await inventoryRepo.list(supabase, false)
    const pantryForMatching = pantryItems.map((p) => ({
      name: p.name,
      expiryDate: p.expiryDate,
    }))

    let updated = 0

    for (const recipe of recipes) {
      try {
        const result = await recipeRepo.getById(supabase, recipe.id)
        if (!result) continue

        const parsedIngredients: ParsedIngredient[] = result.ingredients.map((ing) => ({
          name: ing.name,
          canonicalName: ing.canonicalName,
          quantity: ing.quantity,
          unit: ing.unit,
          optional: ing.optional ?? false,
        }))

        const pantryMatches = computePantryMatches(parsedIngredients, pantryForMatching)
        const score = computeCompatibilityScore(pantryMatches)
        await recipeRepo.updateScore(supabase, recipe.id, score)
        updated++
      } catch {
        // Skip failed individual recipes; continue with others
      }
    }

    const lastChecked = new Date().toISOString()
    return NextResponse.json({ updated, lastChecked })
  } catch (error) {
    console.error("RECIPES RECALCULATE ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
