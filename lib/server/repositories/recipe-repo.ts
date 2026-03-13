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

    // Return the most recent import for this URL regardless of status.
    // The caller checks recipe existence to decide whether to treat it as a duplicate or allow re-import.
    const { data: rows, error } = await supabase
      .from("recipe_imports")
      .select("*")
      .eq("user_id", user.id)
      .eq("canonical_url", canonicalUrl)
      .order("created_at", { ascending: false })
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
    totalTimeMinutes: row.total_time_minutes ?? undefined,
    instructions: row.instructions ?? undefined,
    imageUrl: row.image_url ?? undefined,
    notes: row.notes ?? undefined,
    pantryCompatibilityScore: row.pantry_compatibility_score ?? undefined,
    pantryLastChecked: row.pantry_last_checked ?? undefined,
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
    preparation: row.preparation ?? undefined,
    ingredientGroup: row.ingredient_group ?? undefined,
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
      totalTimeMinutes?: number
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
        total_time_minutes: recipe.totalTimeMinutes || null,
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
      preparation: ing.preparation || null,
      ingredient_group: ing.ingredientGroup || null,
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
      .order("pantry_compatibility_score", { ascending: false, nullsFirst: false })

    if (error) throw error
    return (data ?? []).map(recipeToDomain)
  },

  async updateScore(
    supabase: SupabaseClient,
    id: string,
    score: number,
  ): Promise<void> {
    const { error } = await supabase
      .from("recipes")
      .update({
        pantry_compatibility_score: score,
        pantry_last_checked: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw error
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

  async update(
    supabase: SupabaseClient,
    id: string,
    fields: {
      title?: string
      servings?: number | null
      prepTimeMinutes?: number | null
      cookTimeMinutes?: number | null
      totalTimeMinutes?: number | null
      notes?: string | null
      imageUrl?: string | null
    },
  ): Promise<Recipe> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const payload: any = { updated_at: new Date().toISOString() }
    if (fields.title !== undefined) payload.title = fields.title
    if (fields.servings !== undefined) payload.servings = fields.servings
    if (fields.prepTimeMinutes !== undefined) payload.prep_time_minutes = fields.prepTimeMinutes
    if (fields.cookTimeMinutes !== undefined) payload.cook_time_minutes = fields.cookTimeMinutes
    if (fields.totalTimeMinutes !== undefined) payload.total_time_minutes = fields.totalTimeMinutes
    if (fields.notes !== undefined) payload.notes = fields.notes
    if (fields.imageUrl !== undefined) payload.image_url = fields.imageUrl

    const { data: rows, error } = await supabase
      .from("recipes")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()

    if (error) throw error
    if (!rows?.[0]) throw new Error("Recipe not found or unauthorized")
    return recipeToDomain(rows[0])
  },

  async updateFull(
    supabase: SupabaseClient,
    id: string,
    recipe: {
      title: string
      servings?: number | null
      prepTimeMinutes?: number | null
      cookTimeMinutes?: number | null
      totalTimeMinutes?: number | null
      instructions?: string[]
      imageUrl?: string | null
      notes?: string | null
    },
    ingredients: Omit<RecipeIngredient, "id" | "recipeId">[],
  ): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const payload: any = {
      title: recipe.title,
      updated_at: new Date().toISOString(),
    }
    if (recipe.servings !== undefined) payload.servings = recipe.servings
    if (recipe.prepTimeMinutes !== undefined) payload.prep_time_minutes = recipe.prepTimeMinutes
    if (recipe.cookTimeMinutes !== undefined) payload.cook_time_minutes = recipe.cookTimeMinutes
    if (recipe.totalTimeMinutes !== undefined) payload.total_time_minutes = recipe.totalTimeMinutes
    if (recipe.instructions !== undefined) payload.instructions = recipe.instructions
    if (recipe.imageUrl !== undefined) payload.image_url = recipe.imageUrl
    if (recipe.notes !== undefined) payload.notes = recipe.notes

    const { data: recipeRows, error: recipeError } = await supabase
      .from("recipes")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()

    if (recipeError) throw recipeError
    if (!recipeRows?.[0]) throw new Error("Recipe not found or unauthorized")

    // Replace all ingredients: delete old, insert new
    const { error: delError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", id)
    if (delError) throw delError

    let savedIngredients: RecipeIngredient[] = []
    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map((ing, i) => ({
        id: crypto.randomUUID(),
        recipe_id: id,
        name: ing.name,
        canonical_name: ing.canonicalName || null,
        quantity: ing.quantity ?? null,
        unit: ing.unit || null,
        optional: ing.optional ?? false,
        sort_order: ing.sortOrder ?? i,
        preparation: ing.preparation || null,
        ingredient_group: ing.ingredientGroup || null,
      }))

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

  async delete(supabase: SupabaseClient, id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Get the recipe to find its import_id before deleting
    const { data: recipeRows } = await supabase
      .from("recipes")
      .select("import_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1)

    const importId = recipeRows?.[0]?.import_id

    const { error: ingError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", id)

    if (ingError) throw ingError

    const { error: recipeError } = await supabase
      .from("recipes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (recipeError) throw recipeError

    // Reset import record status so the URL can be re-imported
    if (importId) {
      await supabase
        .from("recipe_imports")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", importId)
        .eq("user_id", user.id)
    }
  },
}
