import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { recipeImportRepo } from "@/lib/server/repositories/recipe-repo"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Authenticate via shared secret (not user auth — this is machine-to-machine)
    const secret = request.headers.get("x-n8n-secret") || ""
    const expectedSecret = process.env.N8N_CALLBACK_SECRET || ""

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()

    // Service role client bypasses RLS — the callback is authenticated
    // by the shared secret, not by a user session.
    const supabase = supabaseAdmin

    if (body.error) {
      await recipeImportRepo.updateFromCallback(supabase, id, {
        status: "failed",
        errorMessage: typeof body.error === "string" ? body.error : "Extraction failed",
        rawContent: body.rawContent,
        rawMetadata: body.rawMetadata,
      })
      return NextResponse.json({ ok: true, status: "failed" })
    }

    const parsedRecipe = body.recipe || body.parsedRecipe
    if (parsedRecipe && Array.isArray(parsedRecipe.steps)) {
      parsedRecipe.steps = parsedRecipe.steps.map((s: any) => {
        if (typeof s === 'string') return s
        if (s && typeof s === 'object') return s.step || s.text || s.instruction || s.description || JSON.stringify(s)
        return String(s)
      })
    }
    // Strip any leading quantity/unit prefix the LLM accidentally included in ingredient names.
    // e.g. "½ cup (35-40g dry) Poha" → "Poha", "2 tbsp Olive Oil" → "Olive Oil"
    const QUANTITY_PREFIX_RE = /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,\/ ()]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|g|kg|ml|L|oz|lb|pcs|fl\s*oz)?\s*/i
    if (parsedRecipe && Array.isArray(parsedRecipe.ingredients)) {
      parsedRecipe.ingredients = parsedRecipe.ingredients.map((ing: any) => {
        if (!ing || typeof ing.name !== 'string') return ing
        const cleaned = ing.name.replace(QUANTITY_PREFIX_RE, "").trim()
        return cleaned.length > 0 ? { ...ing, name: cleaned } : ing
      })
    }
    if (!parsedRecipe || !parsedRecipe.title) {
      await recipeImportRepo.updateFromCallback(supabase, id, {
        status: "failed",
        errorMessage: "No recipe could be extracted from this URL.",
        rawContent: body.rawContent,
        rawMetadata: body.rawMetadata,
      })
      return NextResponse.json({ ok: true, status: "failed" })
    }

    await recipeImportRepo.updateFromCallback(supabase, id, {
      status: "ready",
      parsedRecipe,
      rawContent: body.rawContent,
      rawMetadata: body.rawMetadata,
    })

    return NextResponse.json({ ok: true, status: "ready" })
  } catch (error) {
    console.error("RECIPE CALLBACK ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
