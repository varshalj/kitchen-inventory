# Design conventions

How this app builds interfaces and interactions. It translates Apple's
fluid-interface and design principles (the `apple-design` skill) into the
concrete patterns used here. [CLAUDE.md](../CLAUDE.md) has the short version;
this is the rationale and the how.

The through-line: an interface feels alive when motion starts from the current
on-screen value, inherits the user's velocity, projects momentum, and can be
grabbed and reversed at any instant — and when colour, depth, and type adapt to
context instead of being hard-coded.

---

## 1. Colour — semantic tokens, never raw palette

All colour flows through CSS-variable tokens defined in
[`app/globals.css`](../app/globals.css) as a two-layer system: raw HSL values
live in `:root` and `.dark`, and `@theme inline` maps them to Tailwind
utilities via `var(--…)`. That's what makes every colour adapt to light/dark
for free.

**Use tokens:** `background`, `foreground`, `card`, `popover`, `primary`,
`secondary`, `muted`, `accent`, `border`, `input`, `ring`, and the semantic
states `destructive`, `warning`, `success`, plus `brand` (the orange accent).
Each has a `-foreground` where it's used as a solid fill. Tints use the opacity
modifier: `bg-warning/10 text-warning border-warning/20`.

**Never** use raw Tailwind palette utilities (`bg-red-500`, `text-amber-600`,
`border-green-200`, gradients like `from-orange-400`). They don't adapt to dark
mode and fragment the palette. Need a new state colour? Add a token in both
`:root` and `.dark`, then map it in `@theme inline`.

Mapping cheatsheet for status: red → `destructive`, amber/yellow → `warning`,
green/emerald → `success`, the orange brand chrome → `brand`.

**Enforcement:** `pnpm run design:lint`
([scripts/design-lint.mjs](../scripts/design-lint.mjs)) runs in CI on PRs and
fails on newly-added raw palette colours. It's diff-based, so it only flags what
a change introduces. Genuinely decorative colours (gold rating stars, the
landing brand gradient) append `design-lint-ok` on the line to opt out — keep
these rare and obvious.

### Gotcha: opaque backgrounds over interactive layers

The inventory row is a card slider stacked (`z-10`) on top of always-present
swipe action panels (`z-0`). The slider must have an **opaque** base
(`bg-card`) — an expiry-state card using only a translucent tint (`bg-*/10`)
let the panels show through at rest. This shipped as a regression once
([the fix](../components/inventory-dashboard.tsx): `bg-card` on the slider
wrapper). Whenever a surface sits above interactive content, its background is
opaque.

---

## 2. Gestures — velocity-aware, interruptible springs

Reference implementation: the swipe-to-reveal engine in
[`components/inventory-dashboard.tsx`](../components/inventory-dashboard.tsx)
(`handlePointerDown/Move/Up`, `springCardTo`, `swipeReleaseVelocity`,
`clampWithRubber`).

- **Pointer Events + `setPointerCapture`** once a horizontal drag is committed —
  tracking survives the pointer leaving the element. Decide direction on ~10px
  of movement; let vertical scroll pass through (`touch-action: pan-y`).
- **1:1 tracking** from the grab point, keeping the offset.
- **Velocity history** (last ~90ms) → **momentum projection**
  (`current + v·0.499`, scroll-style) picks the snap target, so a flick throws
  the element rather than requiring a fixed threshold.
- **Velocity handoff** into a hand-rolled rAF spring (critically damped by
  default; a little bounce only above a flick threshold) — no seam between drag
  and settle.
- **Interruptible:** `pointerdown` cancels the running spring and grabs from the
  live value; never lock out input during a transition.
- **Rubber-band** past bounds instead of a hard clamp.

Do **not** animate gesture-driven motion with fixed-duration CSS transitions or
`@keyframes` — they can't be grabbed and reversed mid-flight.

---

## 3. Sheets & overlays

- Bottom sheets use the Vaul drawer in
  [`components/ui/drawer.tsx`](../components/ui/drawer.tsx) so they drag/flick to
  dismiss. Don't build new bottom sheets on raw Radix Dialog.
  (`components/ui/sheet.tsx` remains only for the sidebar's side panel.)
- Enter and exit along the same path; anchor popovers/menus to their trigger.

---

## 4. Materials & depth

Floating chrome (nav, header, sheets, toasts, the review chip) is a translucent
material, not an opaque bar: `bg-background/xx backdrop-blur-*` with a
`supports-[backdrop-filter]:bg-background/xx` fallback. Content scrolls under it.
Shadows scale with elevation (subtle on cards, stronger on floating buttons and
dialogs). Never stack one light translucent surface directly on another.

---

## 5. Motion & accessibility

- **`prefers-reduced-motion`** is honored app-wide. CSS animations/transitions
  are neutralised by the media block in `globals.css`; JS-driven motion must
  check it itself — Framer Motion via `useReducedMotion()`, imperative code via
  the `swipeReduceMotion()` pattern (CSS can't stop JS-driven transforms).
- **Haptics** go through `triggerHaptic` ([lib/haptics.ts](../lib/haptics.ts)),
  which already no-ops under reduced motion. Fire on the causal event, same
  frame as the visual; reserve for meaningful moments (success, error, commit).
- Not yet done, worth adding when touched: `prefers-reduced-transparency` and
  `prefers-contrast` fallbacks for the translucent chrome.

---

## 6. Typography & zoom

- Sizes are rem (Tailwind defaults) and the root font-size is **not** pinned, so
  text scales with the user's browser/OS setting. Keep it that way.
- Never cap viewport zoom (`maximumScale`, `userScalable: false`) — it fails
  WCAG 1.4.4. iOS auto-zoom on input focus is prevented by the `16px` font-size
  on form controls in `globals.css`; keep inputs ≥16px to avoid focus-zoom.
- Size-specific tracking: large display sizes (`text-2xl`+) get negative
  letter-spacing via a base rule in `globals.css`; body stays at 0. Corner radii
  derive from `--radius` (the `--radius-{sm,md,lg,xl}` scale) — change the token,
  not individual `rounded-*` values.

---

## 7. Feedback & process

- Optimistic UI: apply the change instantly, reconcile with the server after,
  and offer **undo** for destructive actions (see the consume/waste/delete flow).
- Respond on press (`:active`), not on release.
- **Prototype interactively** for non-trivial interactions before committing to
  an implementation.
- **Visually verify** gesture, translucency, and dark-mode changes in a running
  app, in both light and dark, before merging. Type-check and build passing do
  not catch visual regressions.
