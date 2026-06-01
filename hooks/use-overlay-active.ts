"use client"

/**
 * Detects whether any modal / sheet / dialog overlay is currently open.
 *
 * Implementation: MutationObserver on `document.body` watching for changes
 * to `data-state` attributes on `[role="dialog"]` / `[role="alertdialog"]`
 * nodes. This is how Radix UI signals overlay open/close — they portal
 * the overlay into the DOM and toggle data-state="open"/"closed".
 *
 * Why this approach (vs. a global store every overlay registers with):
 *   - Zero changes to existing sheet/dialog components (~10 of them
 *     across the app, all Radix-based)
 *   - Works automatically for any future Radix-based overlay too
 *
 * Trade-off: tightly coupled to Radix's DOM convention. If we ever swap
 * to a non-Radix overlay library, this needs updating.
 */

import { useEffect, useState } from "react"

// Radix dialogs/sheets/popovers set data-state to "open" when visible.
// We check both `role="dialog"` (Sheet, Dialog) and `role="alertdialog"`
// (AlertDialog) since both are common overlay patterns.
const OVERLAY_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

export function useOverlayActive(): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return

    const check = () => {
      setActive(document.querySelector(OVERLAY_SELECTOR) !== null)
    }

    check()

    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
      childList: true,
    })

    return () => observer.disconnect()
  }, [])

  return active
}
