#!/usr/bin/env node
/**
 * design-lint — guards the house UI conventions (see CLAUDE.md and
 * docs/design-conventions.md). Diff-based: it only flags lines a change
 * *adds*, so existing intentional exceptions never trip it and it can't
 * fail unrelated PRs.
 *
 * Rule enforced: no raw Tailwind palette colours (bg-red-500, text-amber-600,
 * border-green-200, …) in UI code. Use semantic tokens instead — bg-warning,
 * text-destructive, bg-success, text-brand, bg-muted, etc. — so colours adapt
 * to light/dark. Add new tokens in app/globals.css rather than reaching for a
 * raw palette value.
 *
 * Escape hatch: append the marker `design-lint-ok` on the same line for a
 * genuinely decorative colour (e.g. gold rating stars, a brand gradient).
 *
 * Usage: node scripts/design-lint.mjs [baseRef]
 *   baseRef defaults to $BASE_SHA (set in CI) then origin/main.
 */
import { execSync } from 'node:child_process'

const base = process.argv[2] || process.env.BASE_SHA || 'origin/main'

const PREFIX =
  'bg|text|border|from|via|to|ring|fill|stroke|shadow|outline|decoration|divide|accent|caret'
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW_COLOR = new RegExp(`\\b(${PREFIX})-(${PALETTE})-\\d{2,3}\\b`)

let diff
try {
  // Two-dot diff: added ('+') lines are what HEAD introduces vs. the base tree.
  // Robust under shallow clones (no merge-base needed).
  diff = execSync(`git diff --unified=0 ${base} HEAD -- components app`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (err) {
  // If we can't diff (e.g. missing base locally), don't block — just skip.
  console.warn(`design-lint: skipped (could not diff against ${base}): ${err.message}`)
  process.exit(0)
}

const violations = []
let file = null
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) {
    file = line.slice(6)
    continue
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue
  if (file && !/\.(tsx|css)$/.test(file)) continue
  const content = line.slice(1)
  if (content.includes('design-lint-ok')) continue
  const m = content.match(RAW_COLOR)
  if (m) violations.push({ file, token: m[0], text: content.trim() })
}

if (violations.length) {
  console.error('\n✖ design-lint: raw Tailwind palette colours are not allowed in UI code.')
  console.error(
    '  Use a semantic token (bg-warning, text-destructive, bg-success, text-brand, …)',
  )
  console.error('  or add a token in app/globals.css. Truly decorative? append `design-lint-ok`.\n')
  for (const v of violations) console.error(`  ${v.file}  →  ${v.token}\n      ${v.text}`)
  console.error(`\n${violations.length} violation(s).`)
  process.exit(1)
}

console.log('✓ design-lint: no newly added raw palette colours.')
