'use client'

import { useEffect, useState } from 'react'

/**
 * True when the app is running as an installed standalone PWA (home-screen /
 * added-to-dock), rather than in a normal browser tab.
 *
 * Used to gate features that break in the installed-PWA web view — e.g. links
 * to third-party sites open in an isolated in-app browser whose localStorage
 * isn't shared with the user's Safari, so those sites lose saved state
 * (location, prices). Such features stay available in a real browser tab.
 */
export function useIsStandalonePWA(): boolean {
  const [standalone, setStandalone] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        // iOS Safari exposes this non-standard flag for home-screen web apps.
        (window.navigator as unknown as { standalone?: boolean }).standalone === true),
  )

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const update = () =>
      setStandalone(
        mq.matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true,
      )
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  return standalone
}
