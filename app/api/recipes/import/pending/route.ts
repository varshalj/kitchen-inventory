import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
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

    const { data: rows, error } = await supabase
      .from("recipe_imports")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["ready", "pending", "extracting", "parsing", "failed"])
      .order("updated_at", { ascending: false })
      .limit(10)

    if (error) throw error

    // Auto-expire imports that have been stuck in a non-terminal status for >15 minutes.
    // This covers workflows that were killed or never received a callback.
    const TIMEOUT_MS = 15 * 60 * 1000
    const now = Date.now()
    const stuckIds = (rows || [])
      .filter((r: any) =>
        !["ready", "failed", "saved", "deleted"].includes(r.status) &&
        now - new Date(r.updated_at).getTime() > TIMEOUT_MS,
      )
      .map((r: any) => r.id)

    if (stuckIds.length > 0) {
      await supabase
        .from("recipe_imports")
        .update({ status: "failed", error_message: "Import timed out. The workflow may not have completed." })
        .in("id", stuckIds)
        .eq("user_id", user.id)

      // Reflect the update in the local rows array so the response is accurate
      for (const row of rows || []) {
        if (stuckIds.includes(row.id)) {
          row.status = "failed"
          row.error_message = "Import timed out. The workflow may not have completed."
        }
      }
    }

    const readyImports = (rows || []).filter((r: any) => r.status === "ready" && r.parsed_recipe)
    const pendingImports = (rows || []).filter((r: any) => !["ready", "failed"].includes(r.status))
    const failedImports = (rows || []).filter((r: any) => r.status === "failed")

    // For ready imports, compute pantry matches
    const enriched = []
    for (const row of readyImports) {
      const parsedRecipe = row.parsed_recipe
      try {
        const pantryItems = await inventoryRepo.list(supabase, false)
        const pantryForMatching = pantryItems.map((p) => ({
          name: p.name,
          expiryDate: p.expiryDate,
        }))
        const parsedIngredients: ParsedIngredient[] = (parsedRecipe.ingredients || []).map((ing: any) => ({
          name: ing.name,
          canonicalName: ing.canonicalName,
          quantity: ing.quantity,
          unit: ing.unit,
          optional: ing.optional ?? false,
        }))
        const pantryMatches = computePantryMatches(parsedIngredients, pantryForMatching)
        const compatibilityScore = computeCompatibilityScore(pantryMatches)

        enriched.push({
          importId: row.id,
          url: row.url,
          platform: row.platform,
          status: row.status,
          recipe: parsedRecipe,
          pantryMatches,
          compatibilityScore,
        })
      } catch {
        enriched.push({
          importId: row.id,
          url: row.url,
          platform: row.platform,
          status: row.status,
          recipe: parsedRecipe,
          pantryMatches: [],
          compatibilityScore: 0,
        })
      }
    }

    return NextResponse.json({
      ready: enriched,
      pending: pendingImports.map((r: any) => ({
        importId: r.id,
        url: r.url,
        status: r.status,
      })),
      failed: failedImports.map((r: any) => ({
        importId: r.id,
        url: r.url,
        errorMessage: r.error_message,
      })),
    })
  } catch (error) {
    console.error("PENDING IMPORTS GET ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
