# Kitchen Inventory — contributor guide

A mobile-first Next.js (App Router, React 19) PWA for tracking kitchen items,
expiry, shopping, and recipes. Tailwind v4 + shadcn/ui primitives, Supabase
backend, MCP server for AI assistants.

## Commands

- `pnpm run dev` — dev server
- `pnpm run typecheck` — `tsc --noEmit` (also the `test` + `lint` scripts)
- `pnpm run build` — production build (`next build`)
- `pnpm run design:lint` — UI-conventions guard (see below)
- `pnpm run audit:deps` — high-severity dependency audit

Package manager is **pnpm 10**. Architecture decisions live in
[docs/decisions.md](docs/decisions.md).

## UI / UX — read before any interface or interaction work

This app follows Apple's fluid-interface and design principles. **For any UI,
motion, gesture, or visual change, consult the `apple-design` skill** if it's
available in your environment. The non-negotiable house rules below apply
regardless — full rationale and patterns are in
[docs/design-conventions.md](docs/design-conventions.md).

- **Colour → semantic tokens only.** Use `bg-background`, `bg-card`,
  `text-muted-foreground`, `text-destructive`, `bg-warning`, `bg-success`,
  `text-brand`, `border-border`, … — **never raw Tailwind palette utilities**
  like `bg-red-500` / `text-amber-600`. New states get a token in
  `app/globals.css` (`:root` **and** `.dark`). This is enforced in CI by
  `design:lint`; truly-decorative exceptions append `design-lint-ok` on the line.
- **Opaque backgrounds over interactive layers.** Anything stacked over the
  swipe action panels (the inventory card slider) must have an opaque base —
  a translucent `bg-*/10` tint alone lets the panels bleed through. This caused
  a real regression; don't repeat it.
- **Gestures → springs, not CSS transitions.** Drag/swipe uses Pointer Events +
  `setPointerCapture`, a velocity history, momentum projection, a velocity-seeded
  spring, and rubber-banding at bounds — and must be interruptible (grabbable
  mid-animation). See the swipe engine in `components/inventory-dashboard.tsx`.
  Don't snap with fixed-duration CSS transitions.
- **Bottom sheets → `components/ui/drawer.tsx` (Vaul)**, not raw Radix Dialog —
  so they drag/flick to dismiss.
- **Motion respects `prefers-reduced-motion`.** CSS is handled globally in
  `globals.css`; JS/Framer Motion must check it (`useReducedMotion`, or the
  `swipeReduceMotion` pattern). Haptics go through `triggerHaptic` (already gated).
- **Materials.** Floating chrome (nav, header, sheets, toasts) is translucent:
  `bg-*/xx + backdrop-blur + supports-[backdrop-filter]:…`.
- **Type & zoom.** Sizes are rem (scale with the user's setting); never pin the
  root font-size, and never cap viewport zoom (`maximumScale` / `userScalable:false`).
- **Feedback.** Optimistic UI with undo for destructive actions; respond on
  press, not release.

### Process

- **Prototype interactively** for non-trivial interactions.
- **Visually verify** gesture, translucency, and dark-mode changes in a running
  app (both light and dark) before merging. `tsc`/build passing does **not**
  catch visual regressions — a translucency bug shipped clean through CI once.
- Keep changes token-driven so light/dark and future theming stay free.
