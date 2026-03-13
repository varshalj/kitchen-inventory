import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeRepo, recipeImportRepo } from "@/lib/server/repositories/recipe-repo"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { computePantryMatches, computeCompatibilityScore } from "@/lib/server/pantry-match"
import type { ParsedIngredient } from "@/lib/types"

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const recipes = await recipeRepo.list(supabase)
    return NextResponse.json(recipes)
  } catch (error) {
    console.error("RECIPES GET ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : []

    const result = await recipeRepo.create(
      supabase,
      {
        title: body.title,
        importId: body.importId,
        sourceUrl: body.sourceUrl,
        sourcePlatform: body.sourcePlatform,
        servings: body.servings,
        prepTimeMinutes: body.prepTimeMinutes,
        cookTimeMinutes: body.cookTimeMinutes,
        totalTimeMinutes: body.totalTimeMinutes,
        instructions: body.instructions,
        imageUrl: body.imageUrl,
        notes: body.notes,
      },
      ingredients.map((ing: any, i: number) => ({
        name: ing.name,
        canonicalName: ing.canonicalName,
        quantity: ing.quantity,
        unit: ing.unit,
        optional: ing.optional ?? false,
        sortOrder: ing.sortOrder ?? i,
        preparation: ing.preparation,
        ingredientGroup: ing.ingredientGroup,
      })),
    )

    // Compute and store pantry compatibility score immediately on save
    try {
      const pantryItems = await inventoryRepo.list(supabase, false)
      const pantryForMatching = pantryItems.map((p) => ({
        name: p.name,
        expiryDate: p.expiryDate,
      }))
      const parsedIngredients: ParsedIngredient[] = result.ingredients.map((ing) => ({
        name: ing.name,
        canonicalName: ing.canonicalName,
        quantity: ing.quantity,
        unit: ing.unit,
        optional: ing.optional ?? false,
      }))
      const pantryMatches = computePantryMatches(parsedIngredients, pantryForMatching)
      const score = computeCompatibilityScore(pantryMatches)
      await recipeRepo.updateScore(supabase, result.recipe.id, score)
      result.recipe.pantryCompatibilityScore = score
      result.recipe.pantryLastChecked = new Date().toISOString()
    } catch {
      // Non-critical — recipe is saved either way
    }

    // Mark import as saved if there's an importId
    if (body.importId) {
      try {
        await recipeImportRepo.updateStatus(supabase, body.importId, "saved")
      } catch {
        // Non-critical — recipe is saved either way
      }
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("RECIPES POST ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
