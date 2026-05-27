import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Returns true if two item names are close enough to be considered the same item.
 * Uses edit distance with a threshold of ≤2 edits OR ≤25% of the longer name's length.
 * Case-insensitive.
 */
export function isFuzzyMatch(a: string, b: string): boolean {
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()
  if (la === lb) return true
  const dist = editDistance(la, lb)
  const threshold = Math.max(2, Math.floor(Math.max(la.length, lb.length) * 0.25))
  return dist <= threshold
}

/**
 * Given a name and a list of existing names, returns the first existing name
 * that is a fuzzy match, or null if none found.
 */
export function findFuzzyMatch(name: string, existingNames: string[]): string | null {
  for (const existing of existingNames) {
    if (isFuzzyMatch(name, existing)) return existing
  }
  return null
}

/**
 * Collapse trivial spelling variants so "Almond" / "almonds" / "Tomatoes" hash
 * to the same key. Idempotent. Intentionally naive — covers the common cases
 * (case, whitespace, simple plural folding) without depending on a dictionary.
 *
 * Used for:
 *   1. MCP agent ambiguity resolution (lib/mcp/tools.ts)
 *   2. Dashboard thread-clustering of same-name inventory rows
 *
 * Distinct from `isFuzzyMatch` — this is for hashable equality (`a === b`),
 * not edit-distance similarity. "Milk" and "Whole Milk" do NOT collapse here.
 */
export function normalizeName(s: string): string {
  const n = s.trim().toLowerCase().replace(/\s+/g, " ")
  if (n.length > 3 && n.endsWith("ies")) return n.slice(0, -3) + "y"
  if (n.length > 3 && n.endsWith("oes")) return n.slice(0, -2)
  if (n.length > 3 && /(sh|ch|ss|x|z)es$/.test(n)) return n.slice(0, -2)
  if (n.endsWith("ss")) return n
  if (n.length > 1 && n.endsWith("s")) return n.slice(0, -1)
  return n
}
