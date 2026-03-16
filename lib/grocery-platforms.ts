export interface GroceryPlatform {
  id: string
  name: string
  /** Quick commerce (instant delivery), grocery delivery, or general ecommerce */
  category: "quick" | "grocery" | "shop"
  searchUrl: (query: string) => string
  website: string
  country: "IN"
}

export const GROCERY_PLATFORMS: GroceryPlatform[] = [
  // ── Quick Commerce ──────────────────────────────────────────────────────────
  {
    id: "blinkit",
    name: "Blinkit",
    category: "quick",
    searchUrl: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
    website: "blinkit.com",
    country: "IN",
  },
  {
    id: "zepto",
    name: "Zepto",
    category: "quick",
    searchUrl: (q) => `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}`,
    website: "zeptonow.com",
    country: "IN",
  },
  {
    id: "swiggy-instamart",
    name: "Swiggy Instamart",
    category: "quick",
    searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
    website: "swiggy.com",
    country: "IN",
  },
  {
    id: "flipkart-minutes",
    name: "Flipkart Minutes",
    category: "quick",
    searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&marketplace=HYPERLOCAL`,
    website: "flipkart.com",
    country: "IN",
  },
  // ── Grocery ─────────────────────────────────────────────────────────────────
  {
    id: "bigbasket",
    name: "BigBasket",
    category: "grocery",
    searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}`,
    website: "bigbasket.com",
    country: "IN",
  },
  {
    id: "jiomart",
    name: "JioMart",
    category: "grocery",
    searchUrl: (q) => `https://www.jiomart.com/search/${encodeURIComponent(q)}`,
    website: "jiomart.com",
    country: "IN",
  },
  {
    id: "flipkart-grocery",
    name: "Flipkart Grocery",
    category: "grocery",
    searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&marketplace=GROCERY`,
    website: "flipkart.com",
    country: "IN",
  },
  {
    id: "dmart-ready",
    name: "DMart Ready",
    category: "grocery",
    searchUrl: (q) => `https://www.dmart.in/searchResult?searchTerm=${encodeURIComponent(q)}`,
    website: "dmart.in",
    country: "IN",
  },
  {
    id: "amazon-fresh",
    name: "Amazon Fresh",
    category: "grocery",
    searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}&i=nowstore`,
    website: "amazon.in",
    country: "IN",
  },
  // ── General Ecommerce ────────────────────────────────────────────────────────
  {
    id: "amazon",
    name: "Amazon",
    category: "shop",
    searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
    website: "amazon.in",
    country: "IN",
  },
  {
    id: "flipkart",
    name: "Flipkart",
    category: "shop",
    searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
    website: "flipkart.com",
    country: "IN",
  },
  {
    id: "myntra",
    name: "Myntra",
    category: "shop",
    searchUrl: (q) => `https://www.myntra.com/search?rawQuery=${encodeURIComponent(q)}`,
    website: "myntra.com",
    country: "IN",
  },
  {
    id: "nykaa",
    name: "Nykaa",
    category: "shop",
    searchUrl: (q) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`,
    website: "nykaa.com",
    country: "IN",
  },
  {
    id: "ikea",
    name: "IKEA India",
    category: "shop",
    searchUrl: (q) => `https://www.ikea.com/in/en/search/?q=${encodeURIComponent(q)}`,
    website: "ikea.com/in",
    country: "IN",
  },
]

export function buildSearchQuery(item: { name: string; brand?: string }): string {
  return [item.brand, item.name].filter(Boolean).join(" ").trim()
}

export function getPlatformsForCountry(country: string): GroceryPlatform[] {
  if (country === "IN") return GROCERY_PLATFORMS
  return []
}
