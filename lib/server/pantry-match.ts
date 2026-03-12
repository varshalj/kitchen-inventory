import { findFuzzyMatch } from "@/lib/utils"
import type { PantryMatch, ParsedIngredient } from "@/lib/types"

export function computePantryMatches(
  ingredients: ParsedIngredient[],
  pantryItems: { name: string; expiryDate?: string | null }[],
): PantryMatch[] {
  const now = new Date()
  const pantryNames = pantryItems.map((p) => p.name)

  return ingredients.map((ing) => {
    const lookupName = ing.canonicalName || ing.name
    const matchedName = findFuzzyMatch(lookupName, pantryNames)

    if (!matchedName) {
      return { ingredientName: ing.name, status: "missing" as const }
    }

    const pantryItem = pantryItems.find(
      (p) => p.name.toLowerCase() === matchedName.toLowerCase(),
    )

    if (!pantryItem?.expiryDate) {
      return { ingredientName: ing.name, status: "available" as const, pantryItemName: matchedName }
    }

    const expiry = new Date(pantryItem.expiryDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24))

    if (daysUntilExpiry < 0) {
      return {
        ingredientName: ing.name,
        status: "expired" as const,
        pantryItemName: matchedName,
        expiryDate: pantryItem.expiryDate,
        daysUntilExpiry,
      }
    }

    if (daysUntilExpiry <= 3) {
      return {
        ingredientName: ing.name,
        status: "expiring" as const,
        pantryItemName: matchedName,
        expiryDate: pantryItem.expiryDate,
        daysUntilExpiry,
      }
    }

    return {
      ingredientName: ing.name,
      status: "available" as const,
      pantryItemName: matchedName,
      expiryDate: pantryItem.expiryDate,
      daysUntilExpiry,
    }
  })
}

export function computeCompatibilityScore(pantryMatches: PantryMatch[]): number {
  if (pantryMatches.length === 0) return 0
  const available = pantryMatches.filter(
    (m) => m.status === "available" || m.status === "expiring",
  ).length
  return Math.round((available / pantryMatches.length) * 100)
}
