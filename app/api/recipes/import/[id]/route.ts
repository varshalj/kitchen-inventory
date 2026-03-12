import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeImportRepo } from "@/lib/server/repositories/recipe-repo"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { computePantryMatches, computeCompatibilityScore } from "@/lib/server/pantry-match"

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
      response.compatibilityScore = computeCompatibilityScore(pantryMatches)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("RECIPE IMPORT GET ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
