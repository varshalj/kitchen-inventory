import type { InventoryItem, ShoppingItem } from "@/lib/types"

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
  // Backward-compatible aliases used by some UI components
  partiallyUsed?: boolean
  used?: boolean
  lastUsedOn?: string
  notes?: string
  price?: string
  brand?: string
  // Track why the item was archived
  archiveReason?: "consumed" | "wasted" | "other"
  // Track source where item was ordered from
  orderedFrom?: string
  // Track if item was added from email sync
  syncedFromEmail?: boolean
  emailSource?: string
  // Product review / rating
  rating?: number // 1-5 stars
  reviewTags?: string[]
  reviewNote?: string
  ratedAt?: string
}

// In-memory storage
let inventoryItems: InventoryItem[] = [
  {
    id: "1",
    name: "Organic Milk",
    category: "Dairy",
    expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Refrigerator",
    quantity: 1,
    addedOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    name: "Chicken Breast",
    category: "Meat",
    expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Freezer",
    quantity: 2,
    addedOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    name: "Apples",
    category: "Fruits",
    expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Refrigerator",
    quantity: 6,
    addedOn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    partiallyConsumed: true,
    consumedOn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    name: "Pasta",
    category: "Grains",
    expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Pantry",
    quantity: 1,
    addedOn: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    name: "Tomato Sauce",
    category: "Canned",
    expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Pantry",
    quantity: 2,
    addedOn: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Add some archived items for demonstration
  {
    id: "6",
    name: "Yogurt",
    category: "Dairy",
    expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Refrigerator",
    quantity: 0,
    addedOn: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    consumedOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    archived: true,
    archiveReason: "consumed",
  },
  {
    id: "7",
    name: "Lettuce",
    category: "Vegetables",
    expiryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Refrigerator",
    quantity: 0,
    addedOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    wastedOn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    archived: true,
    archiveReason: "wasted",
  },
  // Add an item with missing expiry date (synced from email)
  {
    id: "8",
    name: "Onions",
    category: "Vegetables",
    expiryDate: "",
    location: "Pantry",
    quantity: 3,
    addedOn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    syncedFromEmail: true,
    emailSource: "BigBasket",
  },
  {
    id: "9",
    name: "Potatoes",
    category: "Vegetables",
    expiryDate: "",
    location: "Pantry",
    quantity: 5,
    addedOn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    syncedFromEmail: true,
    emailSource: "BigBasket",
  },
]
const isProduction = process.env.NODE_ENV === "production"

if (isProduction) {
  throw new Error("lib/data.ts is a development-only fixture module and must not be imported in production.")
}

export type { InventoryItem, ShoppingItem }

export const devFixtures = {
  inventoryItems: [] as InventoryItem[],
  shoppingItems: [] as ShoppingItem[],
}
