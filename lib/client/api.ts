import type { InventoryItem, ShoppingItem } from "@/lib/types"
import { fetchWithAuth } from "@/lib/api-client"

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || "Request failed")
  }
  return response.json()
}

export async function getInventoryItems(): Promise<InventoryItem[]> {
  return parseResponse(await fetchWithAuth("/api/inventory?archived=false", { cache: "no-store" }))
}

export async function getArchivedItems(): Promise<InventoryItem[]> {
  return parseResponse(await fetchWithAuth("/api/inventory?archived=true", { cache: "no-store" }))
}

export async function addInventoryItem(
  item: InventoryItem,
): Promise<{ item: InventoryItem; completedShoppingItems: Array<{ id: string; name: string }> }> {
  const data = await parseResponse<Record<string, unknown>>(
    await fetchWithAuth("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
  const { _completedShoppingItems, ...itemFields } = data
  return {
    item: itemFields as unknown as InventoryItem,
    completedShoppingItems: (_completedShoppingItems as Array<{ id: string; name: string }>) ?? [],
  }
}

export async function updateInventoryItem(item: InventoryItem): Promise<InventoryItem> {
  return parseResponse(
    await fetchWithAuth(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await parseResponse(await fetchWithAuth(`/api/inventory/${id}`, { method: "DELETE" }))
}

export async function markItemAsConsumed(id: string): Promise<InventoryItem> {
  return parseResponse(await fetchWithAuth(`/api/inventory/${id}/consume`, { method: "POST" }))
}

export async function markItemAsWasted(id: string): Promise<InventoryItem> {
  return parseResponse(await fetchWithAuth(`/api/inventory/${id}/waste`, { method: "POST" }))
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  return parseResponse(await fetchWithAuth("/api/shopping", { cache: "no-store" }))
}

export async function addToShoppingList(item: ShoppingItem): Promise<ShoppingItem> {
  return parseResponse(
    await fetchWithAuth("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function updateShoppingItem(item: ShoppingItem): Promise<ShoppingItem> {
  return parseResponse(
    await fetchWithAuth(`/api/shopping/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  )
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await parseResponse(await fetchWithAuth(`/api/shopping/${id}`, { method: "DELETE" }))
}

// Recipe imports
export async function startRecipeImport(url: string): Promise<{ importId: string; status: string; duplicate?: boolean; message?: string }> {
  return parseResponse(
    await fetchWithAuth("/api/recipes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  )
}

export async function pollRecipeImport(importId: string): Promise<any> {
  return parseResponse(await fetchWithAuth(`/api/recipes/import/${importId}`, { cache: "no-store" }))
}

export async function saveRecipe(recipe: any): Promise<any> {
  return parseResponse(
    await fetchWithAuth("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipe),
    }),
  )
}

export async function getRecipes(): Promise<any[]> {
  return parseResponse(await fetchWithAuth("/api/recipes", { cache: "no-store" }))
}

export async function getRecipeById(id: string): Promise<any> {
  return parseResponse(await fetchWithAuth(`/api/recipes/${id}`, { cache: "no-store" }))
}

export async function recalculateRecipeScores(): Promise<{ updated: number; lastChecked: string }> {
  return parseResponse(
    await fetchWithAuth("/api/recipes/recalculate", { method: "POST" }),
  )
}

export async function updateRecipe(
  id: string,
  data: {
    title?: string
    servings?: number | null
    prepTimeMinutes?: number | null
    cookTimeMinutes?: number | null
    totalTimeMinutes?: number | null
    notes?: string | null
    imageUrl?: string | null
  },
): Promise<any> {
  return parseResponse(
    await fetchWithAuth(`/api/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  )
}

export async function suggestInventoryItems(query: string): Promise<string[]> {
  return parseResponse(
    await fetchWithAuth(`/api/inventory/suggest?q=${encodeURIComponent(query)}`, { cache: "no-store" }),
  )
}

export async function getPendingImports(): Promise<any> {
  return parseResponse(await fetchWithAuth("/api/recipes/import/pending", { cache: "no-store" }))
}

export async function dismissFailedImport(importId: string): Promise<void> {
  await fetchWithAuth(`/api/recipes/import/${importId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "deleted" }),
  })
}

export async function saveRecipeBookmark(data: {
  title: string
  sourceUrl?: string
  notes?: string
}): Promise<any> {
  return parseResponse(
    await fetchWithAuth("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        sourceUrl: data.sourceUrl,
        notes: data.notes,
        isBookmark: true,
        ingredients: [],
        instructions: [],
      }),
    }),
  )
}

export async function parseRecipeText(text: string): Promise<any> {
  return parseResponse(
    await fetchWithAuth("/api/recipes/parse-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  )
}

export async function updateFullRecipe(id: string, data: any): Promise<any> {
  return parseResponse(
    await fetchWithAuth(`/api/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  )
}

export async function deleteRecipe(id: string): Promise<void> {
  await parseResponse(await fetchWithAuth(`/api/recipes/${id}`, { method: "DELETE" }))
}

export async function fetchPendingShare(shareId: string): Promise<string | null> {
  const res = await fetchWithAuth(`/api/share-target/${shareId}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.imageData ?? null
}

export async function deletePendingShare(shareId: string): Promise<void> {
  await fetchWithAuth(`/api/share-target/${shareId}`, { method: "DELETE" })
}
