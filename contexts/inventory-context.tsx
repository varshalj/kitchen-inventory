"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { fetchWithAuth } from "@/lib/api-client"
import { supabase } from "@/lib/supabase-client"
import type { InventoryItem } from "@/lib/types"

/**
 * App-level inventory cache.
 *
 * Problem this solves:
 *   - Today the dashboard fetches `/api/inventory?archived=false` with
 *     `cache: "no-store"` on every mount. Every visit to /dashboard pays
 *     the full round-trip (auth check + DB query + JSON parse) — perceived
 *     as 1-2s on slow connections.
 *   - The data is stable across navigation in 99% of cases, but the
 *     component-local state evaporates on unmount.
 *
 * Strategy: stale-while-revalidate.
 *   1. Fetch once when auth becomes ready. Cache survives navigation.
 *   2. On tab visibility change → visible, refetch in background to catch
 *      changes made on other devices or via external writes (MCP, Alexa).
 *   3. Expose a `refresh()` for the dashboard to call on its own mount —
 *      cheap; if data hasn't changed, the result is identical and there's
 *      no UI flicker.
 *   4. Mutations: callers use `applyOptimistic` to update the cache
 *      synchronously before/after their server request, preserving the
 *      instant-feedback UX the dashboard already has.
 *
 * Scope: inventory only. Shopping/recipes keep their existing fetch logic
 * for now; this pattern can be extended to those tables in a follow-up if
 * needed.
 */

interface InventoryContextValue {
  items: InventoryItem[]
  isLoading: boolean
  /**
   * Trigger a background refetch. Cheap to call on every mount — if the
   * server returns identical data, the cache update is a no-op (React skips
   * the re-render due to shallow equality of the same array reference if the
   * data didn't change, otherwise a single re-render).
   */
  refresh: () => Promise<void>
  /**
   * Synchronous setter for optimistic updates. Used by mutation flows to
   * remove/insert/edit items in the cache immediately, before the server
   * round-trip completes. Mirrors React's setState updater signature.
   */
  applyOptimistic: (updater: (prev: InventoryItem[]) => InventoryItem[]) => void
}

const InventoryContext = createContext<InventoryContextValue | null>(null)

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) {
    throw new Error("useInventory must be used inside <InventoryProvider>")
  }
  return ctx
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  // Guards against concurrent fetches (e.g., visibility change + dashboard
  // mount firing at the same time).
  const fetchInFlight = useRef(false)

  // ─── Track auth state. Only fetch when authenticated. ───────────────────
  useEffect(() => {
    if (!supabase) {
      setAuthReady(false)
      setIsLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!active) return
      setAuthReady(!!data.session)
      if (!data.session) {
        // No session — don't fetch, but clear loading state so consumers don't
        // hang on a skeleton forever on the /auth page.
        setIsLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
      if (!active) return
      if (session) {
        setAuthReady(true)
      } else {
        // Sign-out: clear cache so the next signed-in user doesn't see
        // stale data from the previous account.
        setAuthReady(false)
        setItems([])
        setIsLoading(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // ─── Core fetch ─────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    if (fetchInFlight.current) return
    fetchInFlight.current = true
    try {
      const response = await fetchWithAuth("/api/inventory?archived=false")
      if (!response.ok) {
        throw new Error(`Failed to load inventory (${response.status})`)
      }
      const json = await response.json()
      setItems(Array.isArray(json) ? json : [])
    } catch (error) {
      console.error("Inventory fetch failed:", error)
    } finally {
      fetchInFlight.current = false
      setIsLoading(false)
    }
  }, [])

  // ─── Initial load once authenticated ────────────────────────────────────
  useEffect(() => {
    if (authReady) {
      void fetchItems()
    }
  }, [authReady, fetchItems])

  // ─── Refetch on tab focus / visibility change ───────────────────────────
  // Catches changes made on other devices, other tabs, or via the MCP/Alexa
  // path. Cheap on the server side (single indexed query).
  useEffect(() => {
    if (!authReady) return
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchItems()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [authReady, fetchItems])

  // ─── Optimistic cache mutation ──────────────────────────────────────────
  const applyOptimistic = useCallback(
    (updater: (prev: InventoryItem[]) => InventoryItem[]) => {
      setItems(updater)
    },
    [],
  )

  return (
    <InventoryContext.Provider
      value={{ items, isLoading, refresh: fetchItems, applyOptimistic }}
    >
      {children}
    </InventoryContext.Provider>
  )
}
