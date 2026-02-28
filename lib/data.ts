import type { InventoryItem, ShoppingItem } from "@/lib/types"

import { SEED_INVENTORY_ITEMS, SEED_SHOPPING_ITEMS } from "@/lib/dev-seed-fixtures"

import type { InventoryItem } from "@/lib/domain/inventory"
export type { InventoryItem } from "@/lib/domain/inventory"

// In-memory storage
let inventoryItems: InventoryItem[] = [...SEED_INVENTORY_ITEMS]

if (isProduction) {
  throw new Error("lib/data.ts is a development-only fixture module and must not be imported in production.")
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
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index === -1) {
    return false
  }

  const now = new Date().toISOString()
  inventoryItems[index] = {
    ...inventoryItems[index],
    archived: true,
    archived_at: now,
    archived_reason: "deleted",
    archiveReason: "other",
  }

  return true
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
      archived_at: now,
      archived_reason: "consumed",
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
      archived_at: now,
      archived_reason: "wasted",
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

export interface OperationReceipt {
  id: string
  itemId: string
  action: "consume" | "waste"
  status: "completed" | "undone"
  createdAt: string
  undoExpiresAt: string
  shoppingItemId?: string
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

let operationReceipts: OperationReceipt[] = []

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

export const devFixtures = {
  inventoryItems: [] as InventoryItem[],
  shoppingItems: [] as ShoppingItem[],
}


export function processInventoryOperation(input: {
  itemId: string
  action: "consume" | "waste"
  addToShoppingList?: boolean
}): {
  receipt: OperationReceipt
  item: InventoryItem
  shoppingItem?: ShoppingItem
} | null {
  const item = getInventoryItem(input.itemId)
  if (!item || item.archived) {
    return null
  }

  const previousQuantity = item.quantity ?? 1
  const updated = input.action === "consume" ? markItemAsConsumed(input.itemId) : markItemAsWasted(input.itemId)
  if (!updated) {
    return null
  }

  let shoppingItem: ShoppingItem | undefined
  if (input.addToShoppingList && input.action === "consume") {
    shoppingItem = addToShoppingList({
      id: `shop-${Date.now()}`,
      name: updated.name,
      quantity: previousQuantity,
      category: updated.category,
      notes: "",
      completed: false,
      addedOn: new Date().toISOString(),
      addedFrom: "consumed",
    })
  }

  const createdAt = new Date().toISOString()
  const receipt: OperationReceipt = {
    id: `rcpt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    itemId: updated.id,
    action: input.action,
    status: "completed",
    createdAt,
    undoExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    shoppingItemId: shoppingItem?.id,
  }
  operationReceipts.push(receipt)

  return { receipt, item: updated, shoppingItem }
}

export function undoInventoryOperation(receiptId: string): { receipt: OperationReceipt; item: InventoryItem } | null {
  const receipt = operationReceipts.find((entry) => entry.id === receiptId)
  if (!receipt || receipt.status === "undone") {
    return null
  }

  if (new Date(receipt.undoExpiresAt).getTime() < Date.now()) {
    return null
  }

  const itemIndex = inventoryItems.findIndex((item) => item.id === receipt.itemId)
  if (itemIndex === -1) {
    return null
  }

  const current = inventoryItems[itemIndex]
  const restoredItem: InventoryItem = {
    ...current,
    archived: false,
    archived_at: undefined,
    archived_reason: undefined,
    archiveReason: undefined,
    consumedOn: receipt.action === "consume" ? undefined : current.consumedOn,
    wastedOn: receipt.action === "waste" ? undefined : current.wastedOn,
  }

  inventoryItems[itemIndex] = restoredItem
  receipt.status = "undone"

  return { receipt, item: restoredItem }
}
