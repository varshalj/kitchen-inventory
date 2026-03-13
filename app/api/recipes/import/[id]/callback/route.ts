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
    const _r = body.recipe || body.parsedRecipe;
    const _steps = _r?.steps;
    fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callback:22',message:'relay callback received',data:{id,topLevelKeys:Object.keys(body||{}),recipeKeys:Object.keys(_r||{}),stepsType:Array.isArray(_steps)?'array':typeof _steps,stepsLength:Array.isArray(_steps)?_steps.length:null,firstStep:Array.isArray(_steps)&&_steps.length>0?_steps[0]:null,firstStepType:Array.isArray(_steps)&&_steps.length>0?typeof _steps[0]:null},timestamp:Date.now(),hypothesisId:'H-A'})}).catch(()=>{});
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
