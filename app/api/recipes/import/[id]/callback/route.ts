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

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/recipes/import/[id]/callback:22',message:'n8n callback received',data:{id,hasError:!!body.error,errorMsg:body.error||null,hasRecipe:!!(body.recipe||body.parsedRecipe),recipeTitle:(body.recipe||body.parsedRecipe)?.title||null,rawMetadata:body.rawMetadata||null},timestamp:Date.now(),hypothesisId:'H-callback'})}).catch(()=>{});
    // #endregion

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
