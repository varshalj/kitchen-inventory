import type { InventoryItem, ShoppingItem } from "@/lib/data"


export type EmailIntegrationAccount = {
  id: string
  email: string
  services: string[]
  active: boolean
}

const createIsoOffset = (daysOffset: number) => new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString()

export const AVAILABLE_EMAIL_SERVICES = ["Gmail", "Swiggy", "Blinkit", "Zepto", "BigBasket", "Amazon Fresh", "JioMart"]

export const DEFAULT_ORDER_SOURCES = ["Zomato", "Swiggy", "BigBasket", "Zepto", "FirstClub", "Amazon", "Flipkart"]

export const DEFAULT_STORAGE_LOCATIONS = ["Refrigerator", "Freezer", "Pantry", "Cabinet", "Counter", "Other"]

export const SEED_INVENTORY_ITEMS: InventoryItem[] = [
  { id: "1", name: "Organic Milk", category: "Dairy", expiryDate: createIsoOffset(5), location: "Refrigerator", quantity: 1, addedOn: createIsoOffset(-2) },
  { id: "2", name: "Chicken Breast", category: "Meat", expiryDate: createIsoOffset(2), location: "Freezer", quantity: 2, addedOn: createIsoOffset(-5) },
  { id: "3", name: "Apples", category: "Fruits", expiryDate: createIsoOffset(10), location: "Refrigerator", quantity: 6, addedOn: createIsoOffset(-3), partiallyConsumed: true, consumedOn: createIsoOffset(-1) },
  { id: "4", name: "Pasta", category: "Grains", expiryDate: createIsoOffset(180), location: "Pantry", quantity: 1, addedOn: createIsoOffset(-30) },
  { id: "5", name: "Tomato Sauce", category: "Canned", expiryDate: createIsoOffset(90), location: "Pantry", quantity: 2, addedOn: createIsoOffset(-15) },
  { id: "6", name: "Yogurt", category: "Dairy", expiryDate: createIsoOffset(-5), location: "Refrigerator", quantity: 0, addedOn: createIsoOffset(-15), consumedOn: createIsoOffset(-2), archived: true, archiveReason: "consumed" },
  { id: "7", name: "Lettuce", category: "Vegetables", expiryDate: createIsoOffset(-3), location: "Refrigerator", quantity: 0, addedOn: createIsoOffset(-10), wastedOn: createIsoOffset(-1), archived: true, archiveReason: "wasted", price: "3.99" },
  { id: "8", name: "Onions", category: "Vegetables", expiryDate: "", location: "Pantry", quantity: 3, addedOn: createIsoOffset(-1), syncedFromEmail: true, emailSource: "BigBasket" },
  { id: "9", name: "Potatoes", category: "Vegetables", expiryDate: "", location: "Pantry", quantity: 5, addedOn: createIsoOffset(-1), syncedFromEmail: true, emailSource: "BigBasket" },
]

export const SEED_SHOPPING_ITEMS: ShoppingItem[] = [
  { id: "1", name: "Milk", quantity: 1, category: "Dairy", completed: false, addedOn: new Date().toISOString() },
  { id: "2", name: "Eggs", quantity: 12, category: "Dairy", completed: false, addedOn: new Date().toISOString() },
]
