export interface InventoryItem {
  id: string
  name: string
  category: string
  expiryDate: string
  location: string
  quantity?: number
  archived?: boolean
  addedOn?: string
  consumedOn?: string
  wastedOn?: string
  partiallyConsumed?: boolean
  used?: boolean
  partiallyUsed?: boolean
  lastUsedOn?: string
  notes?: string
  price?: string
  brand?: string
  archiveReason?: "consumed" | "wasted" | "other"
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
  category?: string
  notes?: string
  completed: boolean
  addedOn: string
  addedFrom?: "consumed" | "manual"
  brand?: string
  orderedFrom?: string
}
