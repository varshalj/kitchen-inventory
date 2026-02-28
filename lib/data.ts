import type { InventoryItem, ShoppingItem } from "@/lib/types"

const isProduction = process.env.NODE_ENV === "production"

if (isProduction) {
  throw new Error("lib/data.ts is a development-only fixture module and must not be imported in production.")
}

export type { InventoryItem, ShoppingItem }

export const devFixtures = {
  inventoryItems: [] as InventoryItem[],
  shoppingItems: [] as ShoppingItem[],
}
