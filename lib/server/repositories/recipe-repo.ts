import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  RecipeImport,
  Recipe,
  RecipeIngredient,
  ParsedRecipe,
} from "@/lib/types"

/* ============================= */
/* recipe_imports                */
/* ============================= */

function importToDomain(row: any): RecipeImport {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonical_url ?? undefined,
    platform: row.platform ?? undefined,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    rawMetadata: row.raw_metadata ?? undefined,
    parsedRecipe: row.parsed_recipe ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const recipeImportRepo = {
  async create(
    supabase: SupabaseClient,
    data: { id: string; url: string; canonicalUrl?: string; platform?: string },
  ): Promise<RecipeImport> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: rows, error } = await supabase
      .from("recipe_imports")
      .insert({
        id: data.id,
        user_id: user.id,
        url: data.url,
        canonical_url: data.canonicalUrl,
        platform: data.platform,
        status: "pending",
      })
      .select()

    if (error) throw error
    if (!rows?.[0]) throw new Error("Insert failed")
    return importToDomain(rows[0])
  },

  async getById(supabase: SupabaseClient, id: string): Promise<RecipeImport | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: rows, error } = await supabase
      .from("recipe_imports")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1)

    if (error) throw error
    return rows?.[0] ? importToDomain(rows[0]) : null
  },

  async findByCanonicalUrl(supabase: SupabaseClient, canonicalUrl: string): Promise<RecipeImport | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: rows, error } = await supabase
      .from("recipe_imports")
      .select("*")
      .eq("user_id", user.id)
      .eq("canonical_url", canonicalUrl)
      .eq("status", "saved")
      .limit(1)

    if (error) throw error
    return rows?.[0] ? importToDomain(rows[0]) : null
  },

  /** Called by the n8n callback — uses service-level update (no user_id check needed
      because the callback is authenticated via shared secret). */
  async updateFromCallback(
    supabase: SupabaseClient,
    id: string,
    data: {
      status: string
      parsedRecipe?: ParsedRecipe
      rawContent?: string
      rawMetadata?: Record<string, unknown>
      errorMessage?: string
    },
  ): Promise<void> {
    const payload: any = {
      status: data.status,
      updated_at: new Date().toISOString(),
    }
    if (data.parsedRecipe !== undefined) payload.parsed_recipe = data.parsedRecipe
    if (data.rawContent !== undefined) payload.raw_content = data.rawContent
    if (data.rawMetadata !== undefined) payload.raw_metadata = data.rawMetadata
    if (data.errorMessage !== undefined) payload.error_message = data.errorMessage

    const { error } = await supabase
      .from("recipe_imports")
      .update(payload)
      .eq("id", id)

    if (error) throw error
  },

  async updateStatus(supabase: SupabaseClient, id: string, status: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase
      .from("recipe_imports")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) throw error
  },
}

/* ============================= */
/* recipes + recipe_ingredients  */
/* ============================= */

function recipeToDomain(row: any): Recipe {
  return {
    id: row.id,
    importId: row.import_id ?? undefined,
    title: row.title,
    sourceUrl: row.source_url ?? undefined,
    sourcePlatform: row.source_platform ?? undefined,
    servings: row.servings ?? undefined,
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    cookTimeMinutes: row.cook_time_minutes ?? undefined,
    instructions: row.instructions ?? undefined,
    imageUrl: row.image_url ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ingredientToDomain(row: any): RecipeIngredient {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    canonicalName: row.canonical_name ?? undefined,
    quantity: row.quantity != null ? Number(row.quantity) : undefined,
    unit: row.unit ?? undefined,
    optional: row.optional ?? false,
    sortOrder: row.sort_order ?? 0,
  }
}

export const recipeRepo = {
  async create(
    supabase: SupabaseClient,
    recipe: {
      title: string
      importId?: string
      sourceUrl?: string
      sourcePlatform?: string
      servings?: number
      prepTimeMinutes?: number
      cookTimeMinutes?: number
      instructions?: string[]
      imageUrl?: string
      notes?: string
    },
    ingredients: Omit<RecipeIngredient, "id" | "recipeId">[],
  ): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const recipeId = crypto.randomUUID()

    const { data: recipeRows, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        id: recipeId,
        user_id: user.id,
        import_id: recipe.importId || null,
        title: recipe.title,
        source_url: recipe.sourceUrl || null,
        source_platform: recipe.sourcePlatform || null,
        servings: recipe.servings || null,
        prep_time_minutes: recipe.prepTimeMinutes || null,
        cook_time_minutes: recipe.cookTimeMinutes || null,
        instructions: recipe.instructions || null,
        image_url: recipe.imageUrl || null,
        notes: recipe.notes || null,
      })
      .select()

    if (recipeError) throw recipeError
    if (!recipeRows?.[0]) throw new Error("Recipe insert failed")

    const ingredientRows = ingredients.map((ing, i) => ({
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      name: ing.name,
      canonical_name: ing.canonicalName || null,
      quantity: ing.quantity ?? null,
      unit: ing.unit || null,
      optional: ing.optional ?? false,
      sort_order: ing.sortOrder ?? i,
    }))

    let savedIngredients: RecipeIngredient[] = []

    if (ingredientRows.length > 0) {
      const { data: ingData, error: ingError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientRows)
        .select()

      if (ingError) throw ingError
      savedIngredients = (ingData ?? []).map(ingredientToDomain)
    }

    return {
      recipe: recipeToDomain(recipeRows[0]),
      ingredients: savedIngredients,
    }
  },

  async list(supabase: SupabaseClient): Promise<Recipe[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error
    return (data ?? []).map(recipeToDomain)
  },

  async getById(supabase: SupabaseClient, id: string): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] } | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: recipeRows, error: recipeError } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1)

    if (recipeError) throw recipeError
    if (!recipeRows?.[0]) return null

    const { data: ingRows, error: ingError } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true })

    if (ingError) throw ingError

    return {
      recipe: recipeToDomain(recipeRows[0]),
      ingredients: (ingRows ?? []).map(ingredientToDomain),
    }
  },
}
