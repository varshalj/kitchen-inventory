import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeRepo } from "@/lib/server/repositories/recipe-repo"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { computePantryMatches, computeCompatibilityScore } from "@/lib/server/pantry-match"
import type { ParsedIngredient } from "@/lib/types"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await recipeRepo.getById(supabase, id)
    if (!result) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    // Live pantry matching for detail page
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
    const compatibilityScore = computeCompatibilityScore(pantryMatches)

    return NextResponse.json({
      recipe: result.recipe,
      ingredients: result.ingredients,
      pantryMatches,
      compatibilityScore,
    })
  } catch (error) {
    console.error("RECIPE GET BY ID ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const updated = await recipeRepo.update(supabase, id, {
      title: body.title,
      servings: body.servings,
      prepTimeMinutes: body.prepTimeMinutes,
      cookTimeMinutes: body.cookTimeMinutes,
      totalTimeMinutes: body.totalTimeMinutes,
      notes: body.notes,
      imageUrl: body.imageUrl,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("RECIPE PATCH ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await recipeRepo.delete(supabase, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("RECIPE DELETE ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
