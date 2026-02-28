// This file simulates a database for the kitchen inventory app

import { SEED_INVENTORY_ITEMS, SEED_SHOPPING_ITEMS } from "@/lib/dev-seed-fixtures"

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
let inventoryItems: InventoryItem[] = [...SEED_INVENTORY_ITEMS]

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

let shoppingItems: ShoppingItem[] = [...SEED_SHOPPING_ITEMS]

export type AnalyticsTimeFrame = "week" | "month" | "quarter" | "year"

const TIMEFRAME_DAYS: Record<AnalyticsTimeFrame, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
}

const parseItemValue = (item: InventoryItem) => {
  const parsedPrice = Number.parseFloat(item.price || "")
  const price = Number.isFinite(parsedPrice) ? parsedPrice : 5
  return price * (item.quantity || 1)
}

export function getWasteAnalytics(timeFrame: AnalyticsTimeFrame) {
  const now = new Date()
  const rangeDays = TIMEFRAME_DAYS[timeFrame]
  const currentRangeStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
  const previousRangeStart = new Date(currentRangeStart.getTime() - rangeDays * 24 * 60 * 60 * 1000)

  const wastedItems = inventoryItems.filter((item) => item.wastedOn)
  const currentWastedItems = wastedItems.filter((item) => {
    const wastedDate = new Date(item.wastedOn as string)
    return wastedDate >= currentRangeStart && wastedDate <= now
  })
  const previousWastedItems = wastedItems.filter((item) => {
    const wastedDate = new Date(item.wastedOn as string)
    return wastedDate >= previousRangeStart && wastedDate < currentRangeStart
  })

  const previousWasteCount = previousWastedItems.length
  const currentWasteCount = currentWastedItems.length
  const trendPercentage =
    previousWasteCount === 0
      ? currentWasteCount === 0
        ? 0
        : 100
      : Math.round(((currentWasteCount - previousWasteCount) / previousWasteCount) * 100)

  const potentialWaste = Math.round(currentWastedItems.reduce((total, item) => total + parseItemValue(item), 0))
  const previousWasteValue = previousWastedItems.reduce((total, item) => total + parseItemValue(item), 0)
  const monthlySavings = Math.max(0, Math.round(previousWasteValue - potentialWaste))

  const wasteByCategory: Record<string, number> = {}
  currentWastedItems.forEach((item) => {
    wasteByCategory[item.category] = (wasteByCategory[item.category] || 0) + 1
  })

  const topWasteCategories = Object.entries(wasteByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const monthLabel = monthDate.toLocaleString("en-US", { month: "short" })
    const monthWasteCount = wastedItems.filter((item) => {
      const wastedDate = new Date(item.wastedOn as string)
      return wastedDate.getMonth() === monthDate.getMonth() && wastedDate.getFullYear() === monthDate.getFullYear()
    }).length
    return { month: monthLabel, count: monthWasteCount }
  })

  return {
    totalItems: inventoryItems.length,
    expiredItems: currentWasteCount,
    wastePercentage: inventoryItems.length ? Math.round((currentWasteCount / inventoryItems.length) * 100) : 0,
    potentialWaste,
    expiryTrend: trendPercentage,
    topWasteCategories,
    monthlySavings,
    monthlyTrend,
  }
}

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
