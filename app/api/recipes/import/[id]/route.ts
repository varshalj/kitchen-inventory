import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeImportRepo } from "@/lib/server/repositories/recipe-repo"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { findFuzzyMatch } from "@/lib/utils"
import type { PantryMatch, ParsedIngredient } from "@/lib/types"

function computePantryMatches(
  ingredients: ParsedIngredient[],
  pantryItems: { name: string; expiryDate: string }[],
): PantryMatch[] {
  const now = new Date()
  const pantryNames = pantryItems.map((p) => p.name)

  return ingredients.map((ing) => {
    const lookupName = ing.canonicalName || ing.name
    const matchedName = findFuzzyMatch(lookupName, pantryNames)

    if (!matchedName) {
      return { ingredientName: ing.name, status: "missing" as const }
    }

    const pantryItem = pantryItems.find(
      (p) => p.name.toLowerCase() === matchedName.toLowerCase(),
    )

    if (!pantryItem?.expiryDate) {
      return { ingredientName: ing.name, status: "available" as const, pantryItemName: matchedName }
    }

    const expiry = new Date(pantryItem.expiryDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24))

    if (daysUntilExpiry < 0) {
      return {
        ingredientName: ing.name,
        status: "expired" as const,
        pantryItemName: matchedName,
        expiryDate: pantryItem.expiryDate,
        daysUntilExpiry,
      }
    }

    if (daysUntilExpiry <= 3) {
      return {
        ingredientName: ing.name,
        status: "expiring" as const,
        pantryItemName: matchedName,
        expiryDate: pantryItem.expiryDate,
        daysUntilExpiry,
      }
    }

    return {
      ingredientName: ing.name,
      status: "available" as const,
      pantryItemName: matchedName,
      expiryDate: pantryItem.expiryDate,
      daysUntilExpiry,
    }
  })
}

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

    const importRecord = await recipeImportRepo.getById(supabase, id)
    if (!importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 })
    }

    const response: any = {
      importId: importRecord.id,
      status: importRecord.status,
      platform: importRecord.platform,
      url: importRecord.url,
    }

    if (importRecord.status === "failed") {
      response.errorMessage = importRecord.errorMessage
    }

    if (importRecord.status === "ready" && importRecord.parsedRecipe) {
      response.recipe = importRecord.parsedRecipe

      // Run pantry matching
      const pantryItems = await inventoryRepo.list(supabase, false)
      const pantryForMatching = pantryItems.map((p) => ({
        name: p.name,
        expiryDate: p.expiryDate,
      }))

      const ingredients = importRecord.parsedRecipe.ingredients || []
      const pantryMatches = computePantryMatches(ingredients, pantryForMatching)

      response.pantryMatches = pantryMatches

      const totalIngredients = ingredients.length
      const availableCount = pantryMatches.filter(
        (m) => m.status === "available" || m.status === "expiring",
      ).length
      response.compatibilityScore = totalIngredients > 0
        ? Math.round((availableCount / totalIngredients) * 100)
        : 0
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("RECIPE IMPORT GET ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
