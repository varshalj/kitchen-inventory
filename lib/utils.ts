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
