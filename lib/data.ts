import type { InventoryItem, ShoppingItem } from "@/lib/types"

export type { InventoryItem, ShoppingItem }

export type AnalyticsTimeFrame = "week" | "month" | "quarter" | "year"

export interface WasteAnalytics {
  totalItems: number
  expiredItems: number
  wastePercentage: number
  potentialWaste: number
  expiryTrend: number
  topWasteCategories: Array<[string, number]>
  monthlySavings: number
  monthlyTrend: Array<{ month: string; count: number }>
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
]

let shoppingItems: ShoppingItem[] = []
let operationReceipts: OperationReceipt[] = []

export function getInventoryItems(): InventoryItem[] {
  return inventoryItems.filter((item) => !item.archived)
}

export function getArchivedItems(): InventoryItem[] {
  return inventoryItems.filter((item) => item.archived)
}

export function getInventoryItem(id: string): InventoryItem | undefined {
  return inventoryItems.find((item) => item.id === id)
}

export function addInventoryItem(item: InventoryItem): InventoryItem {
  inventoryItems.push(item)
  return item
}

export function updateInventoryItem(updatedItem: InventoryItem): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === updatedItem.id)
  if (index === -1) return undefined
  inventoryItems[index] = updatedItem
  return inventoryItems[index]
}

export function deleteInventoryItem(id: string): boolean {
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index === -1) return false

  inventoryItems[index] = {
    ...inventoryItems[index],
    archived: true,
    archiveReason: "other",
  }
  return true
}

export function markItemAsConsumed(id: string): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index === -1) return undefined

  inventoryItems[index] = {
    ...inventoryItems[index],
    quantity: 0,
    consumedOn: new Date().toISOString(),
    archived: true,
    archiveReason: "consumed",
  }
  return inventoryItems[index]
}

export function markItemAsWasted(id: string): InventoryItem | undefined {
  const index = inventoryItems.findIndex((item) => item.id === id)
  if (index === -1) return undefined

  inventoryItems[index] = {
    ...inventoryItems[index],
    quantity: 0,
    wastedOn: new Date().toISOString(),
    archived: true,
    archiveReason: "wasted",
  }
  return inventoryItems[index]
}

export function getShoppingItems(): ShoppingItem[] {
  return shoppingItems
}

export function addToShoppingList(item: ShoppingItem): ShoppingItem {
  const existingIndex = shoppingItems.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase() && !i.completed)
  if (existingIndex >= 0) {
    shoppingItems[existingIndex].quantity += item.quantity
    return shoppingItems[existingIndex]
  }

  shoppingItems.push(item)
  return item
}

export function updateShoppingItem(updatedItem: ShoppingItem): ShoppingItem | undefined {
  const index = shoppingItems.findIndex((item) => item.id === updatedItem.id)
  if (index === -1) return undefined
  shoppingItems[index] = updatedItem
  return shoppingItems[index]
}

export function deleteShoppingItem(id: string): boolean {
  const initialLength = shoppingItems.length
  shoppingItems = shoppingItems.filter((item) => item.id !== id)
  return shoppingItems.length !== initialLength
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
  if (!item || item.archived) return null

  const previousQuantity = item.quantity ?? 1
  const updated = input.action === "consume" ? markItemAsConsumed(input.itemId) : markItemAsWasted(input.itemId)
  if (!updated) return null

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
    undoExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    shoppingItemId: shoppingItem?.id,
  }
  operationReceipts.push(receipt)

  return { receipt, item: updated, shoppingItem }
}

export function undoInventoryOperation(receiptId: string): { receipt: OperationReceipt; item: InventoryItem } | null {
  const receipt = operationReceipts.find((entry) => entry.id === receiptId)
  if (!receipt || receipt.status === "undone") return null
  if (new Date(receipt.undoExpiresAt).getTime() < Date.now()) return null

  const itemIndex = inventoryItems.findIndex((item) => item.id === receipt.itemId)
  if (itemIndex === -1) return null

  inventoryItems[itemIndex] = {
    ...inventoryItems[itemIndex],
    archived: false,
    archiveReason: undefined,
    consumedOn: receipt.action === "consume" ? undefined : inventoryItems[itemIndex].consumedOn,
    wastedOn: receipt.action === "waste" ? undefined : inventoryItems[itemIndex].wastedOn,
    quantity: Math.max(inventoryItems[itemIndex].quantity ?? 1, 1),
  }

  receipt.status = "undone"
  return { receipt, item: inventoryItems[itemIndex] }
}

export function getWasteAnalytics(timeFrame: AnalyticsTimeFrame): WasteAnalytics {
  const items = getInventoryItems()
  const currentDate = new Date()
  const expiredItems = items.filter((item) => item.expiryDate && new Date(item.expiryDate) < currentDate)

  const potentialWaste = expiredItems.reduce((total, item) => total + (item.quantity ?? 1) * 5, 0)
  const wasteByCategory: Record<string, number> = {}
  expiredItems.forEach((item) => {
    wasteByCategory[item.category] = (wasteByCategory[item.category] || 0) + 1
  })

  const topWasteCategories = Object.entries(wasteByCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const trendBase = timeFrame === "week" ? 4 : timeFrame === "month" ? 8 : timeFrame === "quarter" ? 12 : 16

  return {
    totalItems: items.length,
    expiredItems: expiredItems.length,
    wastePercentage: items.length ? Math.round((expiredItems.length / items.length) * 100) : 0,
    potentialWaste,
    expiryTrend: -5,
    topWasteCategories,
    monthlySavings: 45,
    monthlyTrend: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month, idx) => ({ month, count: Math.max(trendBase - idx, 0) })),
  }
}
