import test from "node:test"
import assert from "node:assert/strict"
import {
  isInventoryApiItem,
  mapInventoryApiItemToDomain,
  mapInventoryItemToApi,
  validateInventoryApiResponse,
  type InventoryApiItem,
  type InventoryItem,
} from "./inventory.ts"

test("isInventoryApiItem validates canonical snake_case fields", () => {
  const item: InventoryApiItem = {
    id: "1",
    name: "Milk",
    category: "Dairy",
    expiry_date: "2026-01-01",
    location: "Fridge",
    partially_consumed_at: "2025-12-24T00:00:00.000Z",
    last_used_at: "2025-12-25T00:00:00.000Z",
  }

  assert.equal(isInventoryApiItem(item), true)
  assert.equal(
    isInventoryApiItem({
      ...item,
      expiry_date: 123,
    }),
    false,
  )
})

test("validateInventoryApiResponse throws for invalid payload", () => {
  assert.throws(() => validateInventoryApiResponse({}))
  assert.throws(() =>
    validateInventoryApiResponse([
      {
        id: "1",
      },
    ]),
  )
})

test("mapInventoryApiItemToDomain maps canonical API fields", () => {
  const apiItem: InventoryApiItem = {
    id: "2",
    name: "Apples",
    category: "Produce",
    expiry_date: "2026-02-10",
    location: "Pantry",
    partially_consumed_at: "2026-02-01T12:00:00.000Z",
    last_used_at: "2026-02-03T12:00:00.000Z",
  }

  const domainItem = mapInventoryApiItemToDomain(apiItem)

  assert.equal(domainItem.expiryDate, apiItem.expiry_date)
  assert.equal(domainItem.partiallyConsumedAt, apiItem.partially_consumed_at)
  assert.equal(domainItem.lastUsedAt, apiItem.last_used_at)
  assert.equal(domainItem.partiallyConsumed, true)
})

test("mapInventoryItemToApi maps domain fields back to canonical API fields", () => {
  const domainItem: InventoryItem = {
    id: "3",
    name: "Spinach",
    category: "Vegetables",
    expiryDate: "2026-03-10",
    location: "Fridge",
    lastUsedAt: "2026-03-05T10:00:00.000Z",
    partiallyConsumedAt: "2026-03-04T10:00:00.000Z",
  }

  const apiItem = mapInventoryItemToApi(domainItem)

  assert.equal(apiItem.expiry_date, domainItem.expiryDate)
  assert.equal(apiItem.last_used_at, domainItem.lastUsedAt)
  assert.equal(apiItem.partially_consumed_at, domainItem.partiallyConsumedAt)
})
