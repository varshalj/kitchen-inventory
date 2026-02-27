import type { InventoryItem, ShoppingItem } from "@/lib/types"

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || "Request failed")
  }
  return response.json()
}

export async function getInventoryItems(): Promise<InventoryItem[]> {
  return parseResponse(await fetch("/api/inventory?archived=false", { cache: "no-store" }))
}

export async function getArchivedItems(): Promise<InventoryItem[]> {
  return parseResponse(await fetch("/api/inventory?archived=true", { cache: "no-store" }))
}

export async function addInventoryItem(item: InventoryItem): Promise<InventoryItem> {
  return parseResponse(
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function updateInventoryItem(item: InventoryItem): Promise<InventoryItem> {
  return parseResponse(
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await parseResponse(await fetch(`/api/inventory/${id}`, { method: "DELETE" }))
}

export async function markItemAsConsumed(id: string): Promise<InventoryItem> {
  return parseResponse(await fetch(`/api/inventory/${id}/consume`, { method: "POST" }))
}

export async function markItemAsWasted(id: string): Promise<InventoryItem> {
  return parseResponse(await fetch(`/api/inventory/${id}/waste`, { method: "POST" }))
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  return parseResponse(await fetch("/api/shopping", { cache: "no-store" }))
}

export async function addToShoppingList(item: ShoppingItem): Promise<ShoppingItem> {
  return parseResponse(
    await fetch("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function updateShoppingItem(item: ShoppingItem): Promise<ShoppingItem> {
  return parseResponse(
    await fetch(`/api/shopping/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await parseResponse(await fetch(`/api/shopping/${id}`, { method: "DELETE" }))
}
