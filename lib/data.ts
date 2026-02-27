// This file simulates a database for the kitchen inventory app

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

// Get all inventory items
export function getInventoryItems(): InventoryItem[] {
  return inventoryItems.filter((item) => !item.archived)
}

// Get archived inventory items
export function getArchivedItems(): InventoryItem[] {
  return inventoryItems.filter((item) => item.archived)
}

// Get a single inventory item by ID
export function getInventoryItem(id: string): InventoryItem | undefined {
  return inventoryItems.find((item) => item.id === id)
}

// Add a new inventory item
export function addInventoryItem(item: InventoryItem): InventoryItem {
  inventoryItems.push(item)
  return item
}

// Update an existing inventory item
export function updateInventoryItem(updatedItem: InventoryItem): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === updatedItem.id)
  if (index !== -1) {
    inventoryItems[index] = updatedItem
    return updatedItem
  }
  return undefined
}

// Delete an inventory item
export function deleteInventoryItem(id: string): boolean {
  const initialLength = inventoryItems.length
  inventoryItems = inventoryItems.filter((item) => item.id !== id)
  return inventoryItems.length !== initialLength
}

// Mark an item as consumed
export function markItemAsConsumed(id: string): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index !== -1) {
    const now = new Date().toISOString()
    inventoryItems[index] = {
      ...inventoryItems[index],
      quantity: 0,
      consumedOn: now,
      archived: true,
      archiveReason: "consumed",
    }
    return inventoryItems[index]
  }
  return undefined
}

// Mark an item as wasted
export function markItemAsWasted(id: string): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index !== -1) {
    const now = new Date().toISOString()
    inventoryItems[index] = {
      ...inventoryItems[index],
      quantity: 0,
      wastedOn: now,
      archived: true,
      archiveReason: "wasted",
    }
    return inventoryItems[index]
  }
  return undefined
}

// Get consumption history
export function getConsumptionHistory(): { item: string; date: string }[] {
  return inventoryItems
    .filter((item) => item.consumedOn)
    .map((item) => ({
      item: item.name,
      date: item.consumedOn || new Date().toISOString(),
    }))
}

// Get waste history
export function getWasteHistory(): { item: string; date: string }[] {
  return inventoryItems
    .filter((item) => item.wastedOn)
    .map((item) => ({
      item: item.name,
      date: item.wastedOn || new Date().toISOString(),
    }))
}

// Get expiring items
export function getExpiringItems(days = 7): InventoryItem[] {
  return inventoryItems.filter((item) => {
    if (item.archived) return false
    if (!item.expiryDate) return false
    const daysUntilExpiry = Math.ceil((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    return daysUntilExpiry <= days
  })
}

// Get items with missing expiry dates
export function getItemsWithMissingExpiry(): InventoryItem[] {
  return inventoryItems.filter((item) => {
    if (item.archived) return false
    return !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())
  })
}

// Add item to shopping list
export interface ShoppingItem {
  id: string
  name: string
  quantity: number
  category?: string
  notes?: string
  completed: boolean
  addedOn: string
  addedFrom?: "consumed" | "manual"
}

let shoppingItems: ShoppingItem[] = [
  {
    id: "1",
    name: "Milk",
    quantity: 1,
    category: "Dairy",
    completed: false,
    addedOn: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Eggs",
    quantity: 12,
    category: "Dairy",
    completed: false,
    addedOn: new Date().toISOString(),
  },
]

export function getShoppingItems(): ShoppingItem[] {
  return shoppingItems
}

export function addToShoppingList(item: ShoppingItem): ShoppingItem {
  // Check if item already exists in shopping list
  const existingIndex = shoppingItems.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase() && !i.completed)

  if (existingIndex >= 0) {
    // Update quantity if item exists
    shoppingItems[existingIndex].quantity += item.quantity
    return shoppingItems[existingIndex]
  } else {
    // Add new item
    shoppingItems.push(item)
    return item
  }
}

export function updateShoppingItem(updatedItem: ShoppingItem): ShoppingItem | undefined {
  const index = shoppingItems.findIndex((item) => item.id === updatedItem.id)
  if (index !== -1) {
    shoppingItems[index] = updatedItem
    return updatedItem
  }
  return undefined
}

export function deleteShoppingItem(id: string): boolean {
  const initialLength = shoppingItems.length
  shoppingItems = shoppingItems.filter((item) => item.id !== id)
  return shoppingItems.length !== initialLength
}
