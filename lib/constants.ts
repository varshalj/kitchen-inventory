export const CATEGORIES = [
  "Fruits", "Vegetables", "Dairy", "Meat", "Grains",
  "Canned", "Frozen", "Snacks", "Beverages", "Condiments", "Spices",
  // Appended (not reshuffled) so existing UI iteration order stays stable.
  // The AI prompts in app/api/ai/{parse-voice,propose-items}/route.ts include
  // tiebreaker rules to disambiguate these from neighbours (Dry Fruits vs
  // Snacks, Supplement vs Medicine). Bump prompt_version when changing here.
  "Dry Fruits", "Supplement", "Medicine",
  "Other",
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
  Spices: 365,
  Snacks: 30,
  Beverages: 30,
  // Long shelf life when sealed. Real-world expiry stamped on the packaging
  // overrides this heuristic — the default just gives the date input a value.
  "Dry Fruits": 180,
  Supplement: 365,
  // Heuristic intentionally generous. Medicines have hard printed expiry dates
  // that the user should set explicitly; the default exists to avoid a blank
  // field, not to be an authoritative estimate.
  Medicine: 365,
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

/**
 * Per-unit input behaviour for quantity entry (partial consume/waste).
 * `discrete` units (pcs, dozen) take integer-only steppers; everything else
 * is continuous and takes decimal entry. `step` drives +/- increments and
 * `decimals` drives display/rounding precision. See unitInput() for the
 * fallback applied to any free-text unit not listed here.
 */
export const UNIT_INPUT: Record<string, { discrete: boolean; step: number; decimals: number }> = {
  pcs: { discrete: true, step: 1, decimals: 0 },
  dozen: { discrete: true, step: 1, decimals: 0 },
  g: { discrete: false, step: 10, decimals: 0 },
  kg: { discrete: false, step: 0.1, decimals: 2 },
  oz: { discrete: false, step: 0.5, decimals: 1 },
  lb: { discrete: false, step: 0.1, decimals: 2 },
  ml: { discrete: false, step: 10, decimals: 0 },
  L: { discrete: false, step: 0.1, decimals: 2 },
  "fl oz": { discrete: false, step: 0.5, decimals: 1 },
  cup: { discrete: false, step: 0.25, decimals: 2 },
  tsp: { discrete: false, step: 0.5, decimals: 1 },
  tbsp: { discrete: false, step: 0.5, decimals: 1 },
}

/** Resolve input behaviour for a unit, with a safe continuous fallback for unknown units. */
export function unitInput(unit?: string | null) {
  return UNIT_INPUT[unit ?? "pcs"] ?? { discrete: false, step: 1, decimals: 2 }
}

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
