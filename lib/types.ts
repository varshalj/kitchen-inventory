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
