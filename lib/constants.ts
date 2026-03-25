export const CATEGORIES = [
  "Fruits", "Vegetables", "Dairy", "Meat", "Grains",
  "Canned", "Frozen", "Snacks", "Beverages", "Condiments", "Other",
] as const

export type Category = (typeof CATEGORIES)[number]

export const DEFAULT_EXPIRY_DAYS: Record<string, number> = {
  Fruits: 7,
  Vegetables: 7,
  Dairy: 14,
  Meat: 14,
  Frozen: 90,
  Grains: 180,
  Canned: 180,
  Condiments: 180,
  Snacks: 30,
  Beverages: 30,
  Other: 30,
}

export function defaultExpiryDate(category?: string): string {
  const days = DEFAULT_EXPIRY_DAYS[category || "Other"] ?? 30
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export const UNIT_GROUPS = [
  { label: "Pieces", units: ["pcs", "dozen"] },
  { label: "Weight", units: ["g", "kg", "oz", "lb"] },
  { label: "Volume", units: ["ml", "L", "fl oz", "cup"] },
  { label: "Cooking", units: ["tsp", "tbsp"] },
]

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units)

export const KNOWN_GROCERY_PLATFORMS: Record<string, string> = {
  "swiggy.com": "Swiggy Instamart",
  "swiggy.in": "Swiggy Instamart",
  "blinkit.com": "Blinkit",
  "grofers.com": "Blinkit",
  "zepto.co": "Zepto",
  "zeptonow.com": "Zepto",
  "bigbasket.com": "BigBasket",
  "amazon.in": "Amazon",
  "amazon.com": "Amazon",
  "flipkart.com": "Flipkart",
  "jiomart.com": "JioMart",
  "dunzo.com": "Dunzo",
  "countrydelight.in": "Country Delight",
  "licious.in": "Licious",
}
