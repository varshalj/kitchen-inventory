import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeImportRepo } from "@/lib/server/repositories/recipe-repo"

function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ""
    // Strip common tracking params
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      url.searchParams.delete(p)
    }
    return url.toString()
  } catch {
    return raw
  }
}

function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "")
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
    if (host.includes("instagram.com")) return "instagram"
    if (host.includes("twitter.com") || host.includes("x.com")) return "twitter"
    if (host.includes("tiktok.com")) return "tiktok"
    return "blog"
  } catch {
    return "unknown"
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
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : ""

    if (!rawUrl) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    try {
      new URL(rawUrl)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    const canonicalUrl = canonicalizeUrl(rawUrl)
    const platform = detectPlatform(canonicalUrl)

    // Deduplication: check if this URL was already imported
    const existing = await recipeImportRepo.findByCanonicalUrl(supabase, canonicalUrl)
    if (existing) {
      // Verify the recipe still exists in the recipes table
      const { data: recipeRows } = await supabase
        .from("recipes")
        .select("id")
        .eq("import_id", existing.id)
        .eq("user_id", user.id)
        .limit(1)

      if (recipeRows && recipeRows.length > 0) {
        return NextResponse.json({
          importId: existing.id,
          status: existing.status,
          duplicate: true,
          message: "This recipe has already been imported.",
        })
      }

      // Recipe was deleted directly from DB; reset import status
      await recipeImportRepo.updateStatus(supabase, existing.id, "deleted")
    }

    const importId = crypto.randomUUID()
    const importRecord = await recipeImportRepo.create(supabase, {
      id: importId,
      url: rawUrl,
      canonicalUrl,
      platform,
    })

    // Fire webhook to n8n
    const webhookUrl = process.env.N8N_WEBHOOK_URL
    if (webhookUrl) {
      const callbackSecret = process.env.N8N_CALLBACK_SECRET || ""
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            importId,
            url: canonicalUrl,
            platform,
            callbackUrl: `${appUrl}/api/recipes/import/${importId}/callback`,
            callbackSecret,
          }),
        })
      } catch (webhookErr) {
        console.error("Failed to trigger n8n webhook:", webhookErr)
        // Update import status to failed if webhook is unreachable
        await recipeImportRepo.updateFromCallback(supabase, importId, {
          status: "failed",
          errorMessage: "Import service is temporarily unavailable. Please try again later.",
        })
        return NextResponse.json(
          { error: "Import service unavailable. Please try again later." },
          { status: 503 },
        )
      }
    } else if (process.env.NODE_ENV !== "production") {
      // Dev fallback: immediately set a mock parsed recipe
      await recipeImportRepo.updateFromCallback(supabase, importId, {
        status: "ready",
        parsedRecipe: {
          title: "Dev Mode: Sample Recipe",
          servings: 4,
          prepTimeMinutes: 15,
          cookTimeMinutes: 30,
          ingredients: [
            { name: "Chicken Breast", canonicalName: "Chicken Breast", quantity: 500, unit: "g" },
            { name: "Onion", canonicalName: "Onion", quantity: 2, unit: "pcs" },
            { name: "Garlic", canonicalName: "Garlic", quantity: 4, unit: "pcs" },
            { name: "Olive Oil", canonicalName: "Olive Oil", quantity: 2, unit: "tbsp" },
            { name: "Salt", canonicalName: "Salt", quantity: 1, unit: "tsp" },
          ],
          steps: [
            "Dice the chicken breast into cubes.",
            "Chop onion and mince garlic.",
            "Heat olive oil in a pan over medium heat.",
            "Cook chicken until golden, about 8 minutes.",
            "Add onion and garlic, cook for 5 minutes.",
            "Season with salt and serve.",
          ],
        },
        rawMetadata: { title: "Dev Mode: Sample Recipe", source: "dev-fallback" },
      })
    }

    return NextResponse.json({
      importId: importRecord.id,
      status: importRecord.status,
    }, { status: 201 })
  } catch (error) {
    console.error("RECIPE IMPORT POST ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
