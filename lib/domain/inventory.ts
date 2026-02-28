export type ArchiveReason = "consumed" | "wasted" | "other"

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
  partiallyConsumedAt?: string
  lastUsedAt?: string
  notes?: string
  price?: string
  brand?: string
  archiveReason?: ArchiveReason
  orderedFrom?: string
  syncedFromEmail?: boolean
  emailSource?: string
  rating?: number
  reviewTags?: string[]
  reviewNote?: string
  ratedAt?: string
}

export interface InventoryApiItem {
  id: string
  name: string
  category: string
  expiry_date: string
  location: string
  quantity?: number
  archived?: boolean
  added_at?: string
  consumed_at?: string
  wasted_at?: string
  partially_consumed_at?: string
  last_used_at?: string
  notes?: string
  price?: string
  brand?: string
  archive_reason?: ArchiveReason
  ordered_from?: string
  synced_from_email?: boolean
  email_source?: string
  rating?: number
  review_tags?: string[]
  review_note?: string
  rated_at?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

export function isInventoryApiItem(value: unknown): value is InventoryApiItem {
  if (!isRecord(value)) return false

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.expiry_date === "string" &&
    typeof value.location === "string" &&
    (value.quantity === undefined || typeof value.quantity === "number") &&
    (value.archived === undefined || typeof value.archived === "boolean") &&
    (value.added_at === undefined || typeof value.added_at === "string") &&
    (value.consumed_at === undefined || typeof value.consumed_at === "string") &&
    (value.wasted_at === undefined || typeof value.wasted_at === "string") &&
    (value.partially_consumed_at === undefined || typeof value.partially_consumed_at === "string") &&
    (value.last_used_at === undefined || typeof value.last_used_at === "string") &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.price === undefined || typeof value.price === "string") &&
    (value.brand === undefined || typeof value.brand === "string") &&
    (value.archive_reason === undefined ||
      value.archive_reason === "consumed" ||
      value.archive_reason === "wasted" ||
      value.archive_reason === "other") &&
    (value.ordered_from === undefined || typeof value.ordered_from === "string") &&
    (value.synced_from_email === undefined || typeof value.synced_from_email === "boolean") &&
    (value.email_source === undefined || typeof value.email_source === "string") &&
    (value.rating === undefined || typeof value.rating === "number") &&
    (value.review_tags === undefined || isStringArray(value.review_tags)) &&
    (value.review_note === undefined || typeof value.review_note === "string") &&
    (value.rated_at === undefined || typeof value.rated_at === "string")
  )
}

export function validateInventoryApiResponse(value: unknown): InventoryApiItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Inventory API response must be an array")
  }

  if (!value.every(isInventoryApiItem)) {
    throw new Error("Inventory API response contains invalid item(s)")
  }

  return value
}

export function mapInventoryApiItemToDomain(item: InventoryApiItem): InventoryItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    expiryDate: item.expiry_date,
    location: item.location,
    quantity: item.quantity,
    archived: item.archived,
    addedOn: item.added_at,
    consumedOn: item.consumed_at,
    wastedOn: item.wasted_at,
    partiallyConsumed: Boolean(item.partially_consumed_at),
    partiallyConsumedAt: item.partially_consumed_at,
    lastUsedAt: item.last_used_at,
    notes: item.notes,
    price: item.price,
    brand: item.brand,
    archiveReason: item.archive_reason,
    orderedFrom: item.ordered_from,
    syncedFromEmail: item.synced_from_email,
    emailSource: item.email_source,
    rating: item.rating,
    reviewTags: item.review_tags,
    reviewNote: item.review_note,
    ratedAt: item.rated_at,
  }
}

export function mapInventoryItemToApi(item: InventoryItem): InventoryApiItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    expiry_date: item.expiryDate,
    location: item.location,
    quantity: item.quantity,
    archived: item.archived,
    added_at: item.addedOn,
    consumed_at: item.consumedOn,
    wasted_at: item.wastedOn,
    partially_consumed_at: item.partiallyConsumedAt,
    last_used_at: item.lastUsedAt,
    notes: item.notes,
    price: item.price,
    brand: item.brand,
    archive_reason: item.archiveReason,
    ordered_from: item.orderedFrom,
    synced_from_email: item.syncedFromEmail,
    email_source: item.emailSource,
    rating: item.rating,
    review_tags: item.reviewTags,
    review_note: item.reviewNote,
    rated_at: item.ratedAt,
  }
}
