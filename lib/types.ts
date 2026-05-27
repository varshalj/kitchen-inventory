export interface InventoryItem {
  id: string
  name: string
  category: string
  expiryDate: string
  location: string
  quantity?: number
  /** Unit of measure. Always set at the DB level (NOT NULL with default 'pcs') as of migration 202605270002. */
  unit: string
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
  /** Set when the user explicitly X-dismissed the review chip without rating. NULL = never dismissed. */
  reviewDismissedAt?: string | null
  // --- SLM-readiness provenance fields (see migration 202605270001) ---
  /** FK to ai_interactions.id when the item originated from a voice or photo capture. */
  aiInteractionId?: string | null
  /** Literal as-spoken (voice) or as-seen on package (photo). Captured silently from model output. */
  nameRaw?: string | null
  /** Literal brand text as printed on the package. `brand` holds the cleaned version. */
  brandRaw?: string | null
  /** Literal quantity string from the model before client-side normalisation, e.g. "0.5 kg", "half kg". */
  quantityRaw?: string | null
  /** Which source produced the saved expiry date. */
  expirySource?: "model" | "client_default" | "user_edit" | null
  /** Where the price was read from on the source artifact. */
  priceSource?: "receipt_line" | "mrp" | "order_total" | "unknown" | null
  /** Bucket for fields the model emits that haven't been promoted to real columns. */
  extractedExtras?: Record<string, unknown> | null
}

export interface ShoppingItem {
  id: string
  name: string
  quantity: number
  /** Unit of measure. Always set at the DB level (NOT NULL with default 'pcs') as of migration 202605270002. */
  unit: string
  category?: string
  notes?: string
  completed: boolean
  addedOn: string
  addedFrom?: "consumed" | "manual" | "voice" | "agent"
  brand?: string
  orderedFrom?: string
  // --- SLM-readiness provenance fields (see migration 202605270001) ---
  aiInteractionId?: string | null
  nameRaw?: string | null
  quantityRaw?: string | null
  extractedExtras?: Record<string, unknown> | null
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
  isBookmark?: boolean
  /** Flat list of ingredient names for client-side search; populated by recipeRepo.list() */
  ingredientNames?: string[]
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
