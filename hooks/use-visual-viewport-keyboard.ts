"use client"

import { useEffect, useState } from "react"

/**
 * Height in px currently occluded by the on-screen keyboard, via the
 * VisualViewport API. Returns 0 when no keyboard is up.
 *
 * iOS/Android shrink `visualViewport.height` when the keyboard opens while the
 * layout viewport (`window.innerHeight`) stays put; the difference is the
 * keyboard inset. We use this to lift bottom-anchored drawers above the keyboard,
 * because Vaul's built-in `repositionInputs` is unreliable in installed iOS PWAs
 * (a short, bottom-anchored sheet ends up fully behind the keyboard). See the
 * sheet-keyboard-occlusion fix.
 */
export function useVisualViewportKeyboard(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return

    const update = () => {
      // Occluded height = layout-viewport bottom − visual-viewport bottom.
      const occluded = window.innerHeight - vv.height - vv.offsetTop
      // Ignore tiny insets (address-bar chrome, sub-pixel jitter); only react to
      // a real keyboard.
      setInset(occluded > 80 ? Math.round(occluded) : 0)
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])

  return inset
}
