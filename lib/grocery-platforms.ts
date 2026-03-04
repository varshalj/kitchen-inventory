export interface GroceryPlatform {
  id: string
  name: string
  searchUrl: (query: string) => string
  website: string
  country: "IN"
}

export const GROCERY_PLATFORMS: GroceryPlatform[] = [
  {
    id: "blinkit",
    name: "Blinkit",
    searchUrl: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
    website: "blinkit.com",
    country: "IN",
  },
  {
    id: "zepto",
    name: "Zepto",
    searchUrl: (q) => `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}`,
    website: "zeptonow.com",
    country: "IN",
  },
  {
    id: "swiggy-instamart",
    name: "Swiggy Instamart",
    searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
    website: "swiggy.com",
    country: "IN",
  },
  {
    id: "bigbasket",
    name: "BigBasket",
    searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}`,
    website: "bigbasket.com",
    country: "IN",
  },
  {
    id: "jiomart",
    name: "JioMart",
    searchUrl: (q) => `https://www.jiomart.com/search/${encodeURIComponent(q)}`,
    website: "jiomart.com",
    country: "IN",
  },
  {
    id: "flipkart-grocery",
    name: "Flipkart Grocery",
    searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&marketplace=GROCERY`,
    website: "flipkart.com",
    country: "IN",
  },
  {
    id: "dmart-ready",
    name: "DMart Ready",
    searchUrl: (q) => `https://www.dmart.in/searchResult?searchTerm=${encodeURIComponent(q)}`,
    website: "dmart.in",
    country: "IN",
  },
  {
    id: "amazon-fresh",
    name: "Amazon Fresh",
    searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}&i=nowstore`,
    website: "amazon.in",
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
