import { CATEGORIES, DEFAULT_EXPIRY_DAYS, KNOWN_GROCERY_PLATFORMS } from "@/lib/constants"
import { ALL_UNITS } from "@/components/quantity-with-units"

// #region agent log
fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'email-normalizer.ts:module-init',message:'ALL_UNITS type check',data:{isArray:Array.isArray(ALL_UNITS),type:typeof ALL_UNITS,value:ALL_UNITS},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
// #endregion

export interface NormalizedItem {
  name: string
  brand?: string
  category: string
  quantity: number
  unit: string
  price?: string
  expiryDate: string
}

export interface NormalizedGroceryPayload {
  discarded: false
  token: string
  platform: string | null
  senderEmail: string | null
  subject: string | null
  orderId: string | null
  orderTotal: string | null
  orderDate: string | null
  items: NormalizedItem[]
  confidence: number | null
  reasoning: string | null
}

export interface NormalizedSkippedPayload {
  discarded: true
  token: string
  senderEmail: string | null
  subject: string | null
}

export type NormalizedPayload = NormalizedGroceryPayload | NormalizedSkippedPayload

export function detectPlatform(senderEmail?: string): string | null {
  if (!senderEmail) return null
  const domain = senderEmail.split("@")[1]?.toLowerCase()
  if (!domain) return null

  for (const [key, name] of Object.entries(KNOWN_GROCERY_PLATFORMS)) {
    if (domain === key || domain.endsWith(`.${key}`)) return name
  }
  return null
}

function normalizeCategory(raw?: string): string {
  if (!raw) return "Other"
  const match = (CATEGORIES as readonly string[]).find(
    (c) => c.toLowerCase() === raw.toLowerCase(),
  )
  return match ?? "Other"
}

function normalizeUnit(raw?: string): string {
  if (!raw) return "pcs"
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'email-normalizer.ts:normalizeUnit',message:'before ALL_UNITS.find',data:{raw,isArray:Array.isArray(ALL_UNITS),typeofFind:typeof (ALL_UNITS as any)?.find},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const match = ALL_UNITS.find((u) => u.toLowerCase() === raw.toLowerCase())
  return match ?? "pcs"
}

function computeExpiry(category: string, raw?: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const days = DEFAULT_EXPIRY_DAYS[category] ?? 30
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export function normalizePayload(body: unknown): NormalizedPayload {
  const obj = body as Record<string, any>
  if (!obj || typeof obj !== "object") throw new Error("Invalid payload")

  const token = obj.token
  if (!token || typeof token !== "string") throw new Error("Missing token")

  if (obj.discarded === true) {
    return {
      discarded: true,
      token,
      senderEmail: obj.senderEmail ?? null,
      subject: obj.subject ?? null,
    }
  }

  const rawItems = obj.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Missing or empty items array")
  }

  const platform = obj.platform || detectPlatform(obj.senderEmail) || null

  const items: NormalizedItem[] = rawItems.map((item: Record<string, any>) => {
    if (!item.name || typeof item.name !== "string") {
      throw new Error("Item missing name")
    }
    const category = normalizeCategory(item.category)
    return {
      name: item.name,
      brand: item.brand || undefined,
      category,
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
      unit: normalizeUnit(item.unit),
      price: item.price || undefined,
      expiryDate: computeExpiry(category, item.expiryDate),
    }
  })

  return {
    discarded: false,
    token,
    platform,
    senderEmail: obj.senderEmail ?? null,
    subject: obj.subject ?? null,
    orderId: obj.orderId ?? null,
    orderTotal: obj.orderTotal ?? null,
    orderDate: obj.orderDate ?? null,
    items,
    confidence: typeof obj.confidence === "number" ? obj.confidence : null,
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : null,
  }
}
