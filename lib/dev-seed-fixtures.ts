import type { InventoryItem, ShoppingItem } from "@/lib/types"


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
