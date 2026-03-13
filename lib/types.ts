export interface InventoryItem {
  id: string
  name: string
  category: string
  expiryDate: string
  location: string
  quantity?: number
  unit?: string
  archived?: boolean
  addedOn?: string
  consumedOn?: string | null
  wastedOn?: string | null
  partiallyConsumed?: boolean
  used?: boolean
  partiallyUsed?: boolean
  lastUsedOn?: string
  notes?: string
  price?: string
  brand?: string
  archiveReason?: "consumed" | "wasted" | "other" | null
  wastageReason?: "expired" | "spoiled" | "unused" | "excess" | null
  orderedFrom?: string
  syncedFromEmail?: boolean
  emailSource?: string
  rating?: number
  reviewTags?: string[]
  reviewNote?: string
  ratedAt?: string
}

export interface ShoppingItem {
  id: string
  name: string
  quantity: number
  unit?: string
  category?: string
  notes?: string
  completed: boolean
  addedOn: string
  addedFrom?: "consumed" | "manual" | "voice"
  brand?: string
  orderedFrom?: string
}

export type RecipeImportStatus = "pending" | "extracting" | "parsing" | "ready" | "saved" | "failed" | "deleted"

export interface RecipeImport {
  id: string
  url: string
  canonicalUrl?: string
  platform?: string
  status: RecipeImportStatus
  errorMessage?: string
  rawMetadata?: Record<string, unknown>
  parsedRecipe?: ParsedRecipe
  createdAt: string
  updatedAt: string
}

export interface ParsedRecipe {
  title: string
  servings?: number
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  totalTimeMinutes?: number
  ingredients: ParsedIngredient[]
  steps: string[]
  imageUrl?: string
}

export interface ParsedIngredient {
  name: string
  canonicalName?: string
  quantity?: number
  unit?: string
  preparation?: string
  ingredientGroup?: string
  optional?: boolean
}

export type PantryMatchStatus = "available" | "expiring" | "expired" | "missing"

export interface PantryMatch {
  ingredientName: string
  status: PantryMatchStatus
  pantryItemName?: string
  expiryDate?: string
  daysUntilExpiry?: number
}

export interface Recipe {
  id: string
  importId?: string
  title: string
  sourceUrl?: string
  sourcePlatform?: string
  servings?: number
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  totalTimeMinutes?: number
  instructions?: string[]
  imageUrl?: string
  notes?: string
  pantryCompatibilityScore?: number
  pantryLastChecked?: string
  createdAt: string
  updatedAt: string
}

export interface RecipeIngredient {
  id: string
  recipeId: string
  name: string
  canonicalName?: string
  quantity?: number
  unit?: string
  preparation?: string
  ingredientGroup?: string
  optional?: boolean
  sortOrder?: number
}
