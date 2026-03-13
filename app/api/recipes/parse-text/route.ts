import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { computePantryMatches, computeCompatibilityScore } from "@/lib/server/pantry-match"
import type { ParsedRecipe, ParsedIngredient } from "@/lib/types"

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given raw recipe text pasted by a user, extract the recipe into structured JSON.

Return a JSON object with:
- "title" (string): recipe name
- "servings" (number or null)
- "prepTimeMinutes" (number or null)
- "cookTimeMinutes" (number or null)
- "totalTimeMinutes" (number or null): only if a total time is given but prep/cook are not broken out
- "ingredients" (array): each with:
  - "name" (string): full ingredient line as written (e.g. "200g medjool dates, roughly chopped")
  - "canonicalName" (string): clean normalized ingredient name only, no quantities or prep notes (e.g. "Medjool Dates")
  - "quantity" (number or null)
  - "unit" (string or null): one of pcs, g, kg, oz, lb, ml, L, cup, tbsp, tsp, fl oz
  - "preparation" (string or null): how to prepare, e.g. "roughly chopped", "melted", "room temperature"
  - "optional" (boolean): true if optional, decorative, or for garnish
  - "ingredientGroup" (string or null): section heading like "For the frosting", "Optional toppings"
- "steps" (array of strings): cooking steps in order, clear and actionable
- "imageUrl" (string or null): image URL if found in the text

Rules:
- Always populate canonicalName even if you must infer it from context
- Separate preparation notes from the ingredient name in canonicalName
- If ingredients are grouped under headings, include the heading in ingredientGroup
- Mark garnishes, decorations, and items explicitly called "optional" as optional: true
- Steps should be concise but complete
- If no recipe is found, return: {"error": "No recipe found in the provided text"}`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const text = typeof body?.text === "string" ? body.text.trim() : ""

    if (!text || text.length < 20) {
      return NextResponse.json(
        { error: "Please provide more recipe text (at least a few lines)." },
        { status: 400 },
      )
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured." },
        { status: 503 },
      )
    }

    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract the recipe from this text:\n\n---\n${text.substring(0, 8000)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      return NextResponse.json(
        { error: "AI returned no response. Please try again." },
        { status: 500 },
      )
    }

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 500 },
      )
    }

    if (parsed.error) {
      return NextResponse.json(
        { error: parsed.error },
        { status: 422 },
      )
    }

    if (!parsed.title) {
      return NextResponse.json(
        { error: "Could not extract a recipe from the provided text." },
        { status: 422 },
      )
    }

    // Normalize steps
    if (Array.isArray(parsed.steps)) {
      parsed.steps = parsed.steps.map((s: any) => {
        if (typeof s === "string") return s
        if (s && typeof s === "object") return s.step || s.text || s.instruction || JSON.stringify(s)
        return String(s)
      })
    }

    const recipe: ParsedRecipe = {
      title: parsed.title,
      servings: parsed.servings ?? undefined,
      prepTimeMinutes: parsed.prepTimeMinutes ?? undefined,
      cookTimeMinutes: parsed.cookTimeMinutes ?? undefined,
      totalTimeMinutes: parsed.totalTimeMinutes ?? undefined,
      imageUrl: parsed.imageUrl ?? undefined,
      ingredients: (parsed.ingredients || []).map((ing: any) => ({
        name: ing.name || "",
        canonicalName: ing.canonicalName,
        quantity: ing.quantity,
        unit: ing.unit,
        preparation: ing.preparation,
        ingredientGroup: ing.ingredientGroup,
        optional: ing.optional ?? false,
      })),
      steps: parsed.steps || [],
    }

    // Compute pantry matches
    const pantryItems = await inventoryRepo.list(supabase, false)
    const pantryForMatching = pantryItems.map((p) => ({
      name: p.name,
      expiryDate: p.expiryDate,
    }))
    const parsedIngredients: ParsedIngredient[] = recipe.ingredients.map((ing) => ({
      name: ing.name,
      canonicalName: ing.canonicalName,
      quantity: ing.quantity,
      unit: ing.unit,
      optional: ing.optional ?? false,
    }))
    const pantryMatches = computePantryMatches(parsedIngredients, pantryForMatching)
    const compatibilityScore = computeCompatibilityScore(pantryMatches)

    return NextResponse.json({
      recipe,
      pantryMatches,
      compatibilityScore,
    })
  } catch (error) {
    console.error("PARSE TEXT ERROR:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    )
  }
}
