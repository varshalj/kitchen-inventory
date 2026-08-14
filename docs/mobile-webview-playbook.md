# iOS / mobile-webview playbook — cross-project

The mobile-web counterpart to the [OpenRouter integration playbook](openrouter-integration-playbook.md).
Same idea: bugs we actually hit in production (installed iOS PWA), each with the
root cause and the *robust* fix — so the next project, and the next change to this
one, skips the debugging loop.

The meta-lesson up front: **every failure here is a runtime/device behavior that
`tsc`, lint, `next build`, and desktop browsers all pass clean.** Verify on a real
device / installed PWA, never CI alone.

---

## 1. iOS auto-zooms into inputs with font-size < 16px

**Symptom:** focusing a field (a `text-sm` number stepper, a paste-text
`textarea`) zooms the whole viewport; iOS doesn't zoom back out, so the user
pinch-zooms out manually every time.

**Cause:** iOS Safari/WebKit force-zooms when a focused form control's computed
font-size is **< 16px**.

**The fix is font-size, never zoom-capping.** `maximumScale` / `user-scalable=no`
"fixes" it but fails WCAG 1.4.4 — banned by house rule.

### Why our first fix wasn't enough (this bug recurred once — learn from it)

A bare `input, textarea, select { font-size: 16px }` rule is **not sufficient**,
for two independent reasons that both bit us:

1. **Specificity.** Any Tailwind `text-*` utility on the control (`.text-sm`,
   specificity `0,1,0`) out-ranks a bare element selector (`0,0,1`). So a
   `text-sm` input/`textarea` keeps its 14px and still zooms.
2. **Selector-list `:not()` is fragile.** The "clever" specificity bump
   `input:not([type="checkbox"], [type="radio"])` uses a `:not()` selector
   *list*, which is unsupported on older iOS Safari — and **one invalid selector
   invalidates the entire grouped rule**, silently disabling the guard on those
   devices. It also only bumped `input`; the sibling bare `textarea`/`select`
   selectors still lost to `.text-sm`.

### The robust rule (in `app/globals.css`)

```css
@media (max-width: 767px) {
  input:not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    font-size: 16px !important;
  }
}
```

- `!important` beats any Tailwind `text-*` regardless of specificity — no
  per-element specificity arithmetic to get wrong.
- **Chained single-arg `:not()`** (`:not(a):not(b)`) is valid on every engine, so
  the rule is never dropped. Never use the `:not(a, b)` list form in a guard.
- Scoped to `max-width: 767px` so desktop keeps its `md:text-*` sizes.

Don't weaken this rule, and don't rely on individual components setting
`text-base md:text-sm` correctly — the guard is the backstop precisely because a
single stray `text-sm` reintroduces the bug.

---

## 2. Bottom sheets get covered by the on-screen keyboard

**Symptom:** an input inside a bottom sheet is hidden behind the keyboard; a
*short* sheet (e.g. "Import from URL") ends up entirely behind it, so the field is
invisible.

**Cause:** the sheets are `position: fixed; bottom: 0` (Vaul). The keyboard covers
the bottom of the screen; a short bottom-anchored sheet is fully occluded. Vaul's
built-in `repositionInputs` is unreliable in an installed iOS PWA.

### The fix (in `components/ui/drawer.tsx` + `hooks/use-visual-viewport-keyboard.ts`)

Read the keyboard inset from the **VisualViewport API**
(`window.innerHeight - visualViewport.height - offsetTop`) and apply it as a
`bottom` offset on `DrawerContent`, lifting the whole sheet above the keyboard
when one opens (no-op otherwise). **Turn Vaul's `repositionInputs` off** on the
`Drawer` root so the two don't double-shift. Every input-bearing sheet inherits
this from the shared drawer — build new sheets on it, don't re-enable
`repositionInputs`, and don't remove the lift.

---

## Where the enforcement lives

- Guard CSS: `app/globals.css` (§1). Keyboard lift: `components/ui/drawer.tsx` +
  `hooks/use-visual-viewport-keyboard.ts` (§2).
- Always-loaded guardrails: the "Type & zoom" and "Bottom sheets" bullets in
  `CLAUDE.md`; fuller rationale in `docs/design-conventions.md` (§3, §6). Both
  point here.
- Cross-project memory: `ios-pwa-mobile-webview-gotchas` (agent memory), sibling
  to `openrouter-integration-gotchas`.
