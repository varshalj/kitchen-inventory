"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Filter, Check, Trash2, Edit, AlertCircle, ShoppingCart, Trash, Sparkles, Clock, ChefHat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { ToastAction } from "@/components/ui/toast"
import { MainLayout } from "@/components/main-layout"
import { AnimatedItem } from "@/components/ui/animated-list"
import { EditItemForm } from "@/components/edit-item-form"
import { useToast } from "@/hooks/use-toast"
import Fuse from "fuse.js"
import { MealPlanGenerator } from "@/components/meal-plan-generator"
import { StarRating } from "@/components/star-rating"
// Review chip + sheet have moved to <ReviewProvider> in contexts/review-context.tsx
// so they survive page navigation. The dashboard now only QUEUES items for
// review via the hook below; the actual rendering happens app-level.
import { useReview } from "@/contexts/review-context"
import { useInventory } from "@/contexts/inventory-context"
import { fetchWithAuth } from "@/lib/api-client"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import { cn, normalizeName } from "@/lib/utils"
import { ItemDetailSheet } from "@/components/item-detail-sheet"
import { formatQuantityUnit } from "@/components/quantity-with-units"
import { BugReportDialog } from "@/components/bug-report-dialog"
import { useBugReportNudge } from "@/hooks/use-bug-report-nudge"
import { RecipeImportSheet } from "@/components/recipe-import-sheet"
import { RecipeReviewScreen } from "@/components/recipe-review-screen"
import { supabase as supabaseClient } from "@/lib/supabase-client"
import { LoadingTip } from "@/components/loading-tip"
import { EmailIngestionBanner } from "@/components/email-ingestion-banner"
import { useEmailIngestionCount } from "@/contexts/email-ingestion-context"
import type { InventoryItem, ParsedRecipe, PantryMatch } from "@/lib/types"
import type { EmailIngestionRow } from "@/lib/server/repositories/email-ingestion-repo"

const WASTE_REASONS = [
  { key: "expired", label: "Expired" },
  { key: "spoiled", label: "Spoiled" },
  { key: "unused", label: "Unused" },
  { key: "excess", label: "Too much" },
] as const

/**
 * Cluster same-name inventory rows into visual threads.
 *
 * Behaviour (per Step 3 design discussion):
 *   - Cluster key  : `normalizeName(item.name)` — lowercase + trim + plural fold.
 *                    "Milk" = "milk" = "Milks" but "Milk" ≠ "Whole Milk".
 *   - List position: the cluster appears where its most-recently-added member
 *                    sits in the input list. The caller passes items already
 *                    sorted by added_on desc, so this is the FIRST occurrence
 *                    of each cluster key as we iterate.
 *   - Inner order  : earliest-expiring first, so the un-indented "leader" card
 *                    is the most-urgent member (FIFO awareness).
 *   - Singletons   : pass through with `isIndented: false`. No threading.
 *
 * Filter interaction is automatic: callers pass only `filteredItems`, so a
 * partial match (1 of 3 milks survives a filter) renders as an unthreaded
 * singleton — consistent with "filters narrow."
 */
function arrangeIntoClusters(
  items: InventoryItem[],
): Array<{ item: InventoryItem; isIndented: boolean }> {
  if (items.length === 0) return []

  // Group by normalized name. Preserve insertion order so the cluster position
  // ends up at the first (most-recently-added) member of each group.
  const groups = new Map<string, InventoryItem[]>()
  for (const item of items) {
    const key = normalizeName(item.name)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }

  const result: Array<{ item: InventoryItem; isIndented: boolean }> = []
  const emitted = new Set<string>()

  for (const item of items) {
    const key = normalizeName(item.name)
    if (emitted.has(key)) continue
    emitted.add(key)

    const cluster = groups.get(key)!
    if (cluster.length === 1) {
      result.push({ item: cluster[0], isIndented: false })
      continue
    }

    // Sort by earliest expiry first. Items missing an expiry date sink to the
    // bottom of the cluster — they're the least "urgent" by FIFO logic.
    const sorted = [...cluster].sort((a, b) => {
      const aTime = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY
      const bTime = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY
      return aTime - bTime
    })

    result.push({ item: sorted[0], isIndented: false })
    for (let i = 1; i < sorted.length; i++) {
      result.push({ item: sorted[i], isIndented: true })
    }
  }

  return result
}

function WasteReasonPicker({ itemId, progressBar }: { itemId: string; progressBar: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <span className="text-xs text-muted-foreground mr-1 self-center">Why?</span>
      {WASTE_REASONS.map((r) => (
        <button
          key={r.key}
          type="button"
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            selected === r.key
              ? "bg-foreground text-background border-foreground"
              : "border-border bg-muted hover:bg-muted/80"
          }`}
          disabled={selected !== null && selected !== r.key}
          onClick={() => {
            setSelected(r.key)
            fetchWithAuth(`/api/inventory/${itemId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wastageReason: r.key }),
            })
          }}
        >
          {r.label}
        </button>
      ))}
      {progressBar}
    </div>
  )
}

export function InventoryDashboard() {
  const router = useRouter()
  // ── Inventory cache lives in <InventoryProvider> (app-level). The dashboard
  // ── reads `items` from there and mutates via `applyOptimistic` so the cache
  // ── survives navigation. `refresh` is called on mount for stale-while-
  // ── revalidate semantics (cached items render instantly; background fetch
  // ── reconciles within ~500ms if anything changed externally).
  const { items, isLoading, refresh: refreshInventory, applyOptimistic: setItems } = useInventory()
  // ── Review chip + sheet live in <ReviewProvider> (app-level). The dashboard
  // ── only QUEUES items for review on consume/waste; the actual rendering
  // ── happens globally so the chip survives navigation.
  const { queueForReview, cancelPending: cancelPendingReview } = useReview()
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [sortBy, setSortBy] = useState("expiryDate")

  // Sync filter + sort state from URL search params (one-way: URL → state).
  // Lets the voice agent's apply_filter / clear_filters tools drive the UI
  // by router.push'ing new query strings. UI-tap toggles still call
  // setActiveFilter / setSortBy directly (no URL write-back) — slight
  // asymmetry but minimal scope, and keeps voice control working without
  // refactoring every filter pill click handler. When URL has no param,
  // we reset to the defaults ("all" / "expiryDate") so clear_filters works.
  const _searchParams = useSearchParams()
  useEffect(() => {
    const urlFilter = _searchParams?.get("filter") ?? "all"
    setActiveFilter(urlFilter)
  }, [_searchParams])
  useEffect(() => {
    const urlSort = _searchParams?.get("sort") ?? "expiryDate"
    setSortBy(urlSort)
  }, [_searchParams])
  const [showMealPlanModal, setShowMealPlanModal] = useState(false)
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  const [userInitials, setUserInitials] = useState("")
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [recipeReviewData, setRecipeReviewData] = useState<{
    importId: string | undefined
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  } | null>(null)
  const { toast } = useToast()
  const { toastWithNudge, bugReportOpen, setBugReportOpen } = useBugReportNudge()
  const fuseRef = useRef<Fuse<InventoryItem> | null>(null)
  const [emailIngestions, setEmailIngestions] = useState<EmailIngestionRow[]>([])
  const { setPendingEmailIngestionCount } = useEmailIngestionCount()

  // iOS-style swipe-to-reveal state
  const cardSliderRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const touchTrackRef = useRef<{
    id: string
    startX: number
    startY: number
    gestureDecided: boolean
    isHorizontal: boolean
    currentDelta: number
  } | null>(null)
  const openSwipesRef = useRef<{ [id: string]: "left" | "right" }>({})
  const justClosedSwipeRef = useRef(false)

  const SWIPE_THRESHOLD = 72
  const LEFT_PANEL_W = 192  // 2 × 96px (Wasted + Delete)
  const RIGHT_PANEL_W = 112 // Consumed

  const applyCardTransform = (id: string, x: number, animated: boolean) => {
    const el = cardSliderRefs.current.get(id)
    if (!el) return
    el.style.transition = animated ? "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "none"
    el.style.transform = x !== 0 ? `translateX(${x}px)` : ""
  }

  const pendingActions = useRef<Map<string, {
    type: "delete" | "consume" | "waste"
    item: InventoryItem
    shoppingItemId?: string
    wasNewInsert?: boolean
    previousShoppingQuantity?: number
    timer?: ReturnType<typeof setTimeout>
    cleanupTimer?: ReturnType<typeof setTimeout>
  }>>(new Map())

// User initials for the avatar — independent of inventory data; stays
// in the dashboard since no other surface needs it.
useEffect(() => {
  if (!supabaseClient) return
  let active = true
  supabaseClient.auth.getUser().then(({ data: { user } }: { data: { user: { email?: string; user_metadata?: Record<string, string> } | null } }) => {
    if (!active || !user) return
    const email = user.email ?? ""
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""
    if (name) {
      const parts = name.trim().split(/\s+/)
      setUserInitials(parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase()
      )
    } else if (email) {
      setUserInitials(email.slice(0, 2).toUpperCase())
    }
  })
  return () => { active = false }
}, [])

// Stale-while-revalidate: trigger a background refetch every time the
// dashboard mounts. If nothing changed externally, the result is identical
// and React skips the re-render. If something changed (e.g., user added an
// item via /add-item, or a write happened on another device), the cache
// updates within ~500ms.
useEffect(() => {
  void refreshInventory()
}, [refreshInventory])

  // Poll email ingestions on mount
  const loadEmailIngestions = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/email-ingestion/pending")
      if (!res.ok) return
      const data = await res.json()
      const rows = data.ingestions ?? []
      setEmailIngestions(rows)
      setPendingEmailIngestionCount(rows.length)
    } catch {
      // Non-fatal
    }
  }, [setPendingEmailIngestionCount])

  useEffect(() => {
    loadEmailIngestions()
    const interval = setInterval(loadEmailIngestions, 60_000)
    return () => clearInterval(interval)
  }, [loadEmailIngestions])

  // Rebuild Fuse index whenever items change so search never returns stale results
  useEffect(() => {
    fuseRef.current = new Fuse(items, {
      keys: ["name", "category", "location", "brand", "notes", "orderedFrom", "reviewTags"],
      threshold: 0.4,
      includeScore: true,
    })
  }, [items])

  useEffect(() => {
    filterAndSortItems(activeFilter, searchQuery, sortBy)
  }, [items, activeFilter, searchQuery, sortBy])

  const filterAndSortItems = (filter: string, query: string, sort: string) => {
    let result = [...items]

    // Apply search query if provided
    if (query && fuseRef.current) {
      const searchResults = fuseRef.current.search(query)
      result = searchResults.map((res) => res.item)
    }

    // Get current date for expiry comparison
    const currentDate = new Date()

    // Apply category filter
    if (filter === "expired") {
      result = result.filter((item) => {
        return new Date(item.expiryDate) < currentDate
      })
    } else if (filter === "expiring-soon") {
      result = result.filter((item) => {
        const expiryDate = new Date(item.expiryDate)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24))
        return daysUntilExpiry <= 7 && daysUntilExpiry >= 0
      })
    } else if (filter === "missing-expiry") {
      // Filter for items with missing or invalid expiry dates
      result = result.filter((item) => {
        return !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())
      })
    } else if (filter !== "all") {
      result = result.filter((item) => item.category === filter)
    }

    // Apply sorting
    if (sort === "expiryDate") {
      result.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === "category") {
      result.sort((a, b) => a.category.localeCompare(b.category))
    } else if (sort === "location") {
      result.sort((a, b) => a.location.localeCompare(b.location))
    } else if (sort === "addedOn") {
      result.sort((a, b) => {
        const aDate = a.addedOn ? new Date(a.addedOn).getTime() : 0
        const bDate = b.addedOn ? new Date(b.addedOn).getTime() : 0
        return bDate - aDate
      })
    }

    setFilteredItems(result)
  }

  const formatDaysLeft = (expiryDate: string) => {
    const now = new Date()
    const exp = new Date(expiryDate)
    now.setHours(0, 0, 0, 0)
    exp.setHours(0, 0, 0, 0)
    const diffDays = Math.round((exp.getTime() - now.getTime()) / (1000 * 3600 * 24))

    if (diffDays < 0) return `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`
    if (diffDays === 0) return "Expiring today"
    if (diffDays === 1) return "Expiring tomorrow"
    return `${diffDays} days left`
  }

  const getExpiryColor = (expiryDate: string) => {
    // Check if expiry date is missing or invalid
    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      return "border-warning/60 bg-warning/10"
    }

    const currentDate = new Date()
    const expDate = new Date(expiryDate)

    // If already expired
    if (expDate < currentDate) {
      return "border-destructive/60 bg-destructive/10"
    }

    const daysUntilExpiry = Math.ceil((expDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24))

    if (daysUntilExpiry <= 3) return "border-warning"
    if (daysUntilExpiry <= 7) return "border-warning/60"
    return "border-success/50"
  }

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    // If any swipe is currently open, mark that we should suppress the next tap
    if (Object.keys(openSwipesRef.current).length > 0) {
      justClosedSwipeRef.current = true
      // Close all open swipes
      Object.keys(openSwipesRef.current).forEach((otherId) => {
        applyCardTransform(otherId, 0, true)
      })
      openSwipesRef.current = {}
    } else {
      justClosedSwipeRef.current = false
    }

    touchTrackRef.current = {
      id,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      gestureDecided: false,
      isHorizontal: false,
      currentDelta: 0,
    }
  }

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    const track = touchTrackRef.current
    if (!track || track.id !== id) return

    const deltaX = e.touches[0].clientX - track.startX
    const deltaY = e.touches[0].clientY - track.startY

    // Decide gesture direction on first meaningful movement
    if (!track.gestureDecided) {
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return
      track.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY)
      track.gestureDecided = true
    }

    if (!track.isHorizontal) return

    // Clamp delta to panel widths to prevent over-swiping
    const clampedDelta = deltaX < 0
      ? Math.max(-LEFT_PANEL_W, deltaX)
      : Math.min(RIGHT_PANEL_W, deltaX)

    track.currentDelta = clampedDelta
    applyCardTransform(id, clampedDelta, false)
  }

  const handleTouchEnd = (id: string) => {
    const track = touchTrackRef.current
    if (!track || track.id !== id) {
      touchTrackRef.current = null
      return
    }

    const delta = track.currentDelta
    touchTrackRef.current = null

    if (delta < -SWIPE_THRESHOLD) {
      // Snap open left panel (Wasted + Delete)
      applyCardTransform(id, -LEFT_PANEL_W, true)
      openSwipesRef.current = { ...openSwipesRef.current, [id]: "left" }
    } else if (delta > SWIPE_THRESHOLD) {
      // Snap open right panel (Consumed)
      applyCardTransform(id, RIGHT_PANEL_W, true)
      openSwipesRef.current = { ...openSwipesRef.current, [id]: "right" }
    } else {
      // Snap back to closed
      applyCardTransform(id, 0, true)
      const next = { ...openSwipesRef.current }
      delete next[id]
      openSwipesRef.current = next
    }
  }

  const handleSwipeAction = (id: string, action: "consumed" | "waste" | "delete") => {
    // Close the swipe panel before triggering the action
    applyCardTransform(id, 0, true)
    const next = { ...openSwipesRef.current }
    delete next[id]
    openSwipesRef.current = next

    const item = items.find((i) => i.id === id)
    if (!item) return

    if (action === "consumed") void handleConsumeItem(item)
    else if (action === "waste") void handleWasteItem(item)
    else if (action === "delete") handleDeleteItem(item)
  }

  const progressBar = (
    <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full">
      <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
    </div>
  )

  const handleDeleteItem = (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    const timer = setTimeout(async () => {
      try {
        await fetchWithAuth(`/api/inventory/${item.id}`, { method: "DELETE" })
      } catch {
        setItems((prev) => [item, ...prev])
        toastWithNudge({ title: "Delete Failed", description: "Could not delete item.", variant: "destructive" })
      }
      pendingActions.current.delete(item.id)
    }, 5000)

    pendingActions.current.set(item.id, { type: "delete", item, timer })

    toast({
      title: "Item deleted",
      duration: 5000,
      description: (
        <div>
          <span>{item.name} will be removed.</span>
          {progressBar}
        </div>
      ),
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const pending = pendingActions.current.get(item.id)
            if (!pending) return
            clearTimeout(pending.timer)
            pendingActions.current.delete(item.id)
            setItems((prev) => [item, ...prev])
          }}
        >
          Undo
        </ToastAction>
      ),
    })
  }

  const handleConsumeItem = async (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    try {
      const response = await fetchWithAuth("/api/inventory/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action: "consume", addToShoppingList: true, originalQuantity: item.quantity, originalUnit: item.unit }),
      })

      const payload = await response.json()
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "Consume operation failed")
      }

      const shoppingItemId: string | undefined = payload.shoppingItemId
      const wasNewInsert: boolean = payload.wasNewInsert ?? true
      const previousShoppingQuantity: number | undefined = payload.previousShoppingQuantity

      // Queue the rating chip via the app-level ReviewProvider — survives any
      // page navigation the user does within the 5.5s undo window. The provider
      // owns the timer; we just hand it the item. queueForReview no-ops if the
      // item is already rated or previously dismissed.
      queueForReview(item, "consumed")

      const cleanupTimer = setTimeout(() => pendingActions.current.delete(item.id), 5500)
      pendingActions.current.set(item.id, {
        type: "consume",
        item,
        shoppingItemId,
        wasNewInsert,
        previousShoppingQuantity,
        cleanupTimer,
      })

      toast({
        title: "Item consumed",
        duration: 5000,
        description: (
          <div>
            <span>{item.name} moved to archive &amp; added to shopping list.</span>
            {progressBar}
          </div>
        ),
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              const pending = pendingActions.current.get(item.id)
              if (!pending) return
              clearTimeout(pending.cleanupTimer)
              // Cancel the chip queue so undo doesn't surface a rating prompt
              // for an action the user reversed.
              cancelPendingReview(item.id)
              pendingActions.current.delete(item.id)
              try {
                await fetchWithAuth(`/api/inventory/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    archived: false,
                    archiveReason: null,
                    consumedOn: null,
                    quantity: item.quantity,
                  }),
                })
                if (pending.shoppingItemId) {
                  if (pending.wasNewInsert) {
                    // Was a fresh insert — safe to delete entirely
                    await fetchWithAuth(`/api/shopping/${pending.shoppingItemId}`, { method: "DELETE" })
                  } else {
                    // Was a merge — restore the previous quantity
                    await fetchWithAuth(`/api/shopping/${pending.shoppingItemId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ quantity: pending.previousShoppingQuantity ?? 1 }),
                    })
                  }
                }
                setItems((prev) => [item, ...prev])
              } catch {
                toastWithNudge({ title: "Undo Failed", description: "Could not restore item.", variant: "destructive" })
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    } catch (error) {
      setItems((prev) => [item, ...prev])
      const message = error instanceof Error ? error.message : "Consume operation failed"
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Consume Failed", description: message, variant: "destructive" })
    }
  }

  // Partial consume/waste from the detail sheet. Splits the item into a consumed
  // portion (decrements stock) and a wasted portion (server creates a prorated
  // archived row that flows into waste analytics). Leaves a remainder in
  // inventory when the two don't add up to the full quantity.
  const handlePartialConsume = async (
    item: InventoryItem,
    spec: { quantityConsumed: number; quantityWasted: number; wastageReason: string | null },
  ) => {
    const { quantityConsumed, quantityWasted, wastageReason } = spec
    const remaining = Number((Number(item.quantity) - quantityConsumed - quantityWasted).toFixed(3))
    const depleted = remaining <= 1e-6

    // Optimistic: decrement in place, or remove the row if nothing is left.
    setItems((prev) =>
      depleted
        ? prev.filter((i) => i.id !== item.id)
        : prev.map((i) => (i.id === item.id ? { ...i, quantity: remaining } : i)),
    )
    triggerHaptic(HAPTIC_SUCCESS)

    const restore = () => setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)])

    try {
      const response = await fetchWithAuth("/api/inventory/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          action: "consume",
          addToShoppingList: depleted,
          originalQuantity: item.quantity,
          originalUnit: item.unit,
          quantityConsumed,
          quantityWasted,
          wastageReason,
        }),
      })

      const payload = await response.json()
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "Consume operation failed")
      }

      const wasteRecordId: string | undefined = payload.wasteRecordId
      const shoppingItemId: string | undefined = payload.shoppingItemId
      const wasNewInsert: boolean = payload.wasNewInsert ?? true
      const previousShoppingQuantity: number | undefined = payload.previousShoppingQuantity

      if (depleted) queueForReview(item, "consumed")

      const undo = async () => {
        cancelPendingReview(item.id)
        try {
          await fetchWithAuth(`/api/inventory/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archived: false, archiveReason: null, consumedOn: null, quantity: item.quantity }),
          })
          if (wasteRecordId) {
            await fetchWithAuth(`/api/inventory/${wasteRecordId}`, { method: "DELETE" })
          }
          if (shoppingItemId) {
            if (wasNewInsert) {
              await fetchWithAuth(`/api/shopping/${shoppingItemId}`, { method: "DELETE" })
            } else {
              await fetchWithAuth(`/api/shopping/${shoppingItemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: previousShoppingQuantity ?? 1 }),
              })
            }
          }
          restore()
        } catch {
          toastWithNudge({ title: "Undo Failed", description: "Could not restore item.", variant: "destructive" })
        }
      }

      const parts: string[] = []
      if (quantityConsumed > 0) parts.push(`${formatQuantityUnit(quantityConsumed, item.unit)} used`)
      if (quantityWasted > 0) parts.push(`${formatQuantityUnit(quantityWasted, item.unit)} wasted`)

      toast({
        title: depleted ? "Item used up" : "Inventory updated",
        duration: 5000,
        description: (
          <div>
            <span>
              {item.name}: {parts.join(", ")}.
              {!depleted && ` ${formatQuantityUnit(remaining, item.unit)} left.`}
            </span>
            {progressBar}
          </div>
        ),
        action: (
          <ToastAction altText="Undo" onClick={undo}>
            Undo
          </ToastAction>
        ),
      })
    } catch (error) {
      restore()
      const message = error instanceof Error ? error.message : "Consume operation failed"
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Consume Failed", description: message, variant: "destructive" })
    }
  }

  const handleWasteItem = async (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    try {
      const response = await fetchWithAuth("/api/inventory/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action: "waste", addToShoppingList: false }),
      })

      const payload = await response.json()
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "Waste operation failed")
      }

      // Queue the rating chip via the app-level ReviewProvider. See the
      // matching block in handleConsumeItem for full rationale.
      queueForReview(item, "wasted")

      const cleanupTimer = setTimeout(() => pendingActions.current.delete(item.id), 5500)
      pendingActions.current.set(item.id, { type: "waste", item, cleanupTimer })

      toast({
        title: "Item marked as wasted",
        duration: 5000,
        description: (
          <div>
            <span>{item.name} moved to archive.</span>
            <WasteReasonPicker itemId={item.id} progressBar={progressBar} />
          </div>
        ),
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              const pending = pendingActions.current.get(item.id)
              if (!pending) return
              clearTimeout(pending.cleanupTimer)
              cancelPendingReview(item.id)
              pendingActions.current.delete(item.id)
              try {
                await fetchWithAuth(`/api/inventory/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    archived: false,
                    archiveReason: null,
                    wastedOn: null,
                    wastageReason: null,
                    quantity: item.quantity,
                  }),
                })
                setItems((prev) => [item, ...prev])
              } catch {
                toastWithNudge({ title: "Undo Failed", description: "Could not restore item.", variant: "destructive" })
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    } catch (error) {
      setItems((prev) => [item, ...prev])
      const message = error instanceof Error ? error.message : "Waste operation failed"
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Waste Failed", description: message, variant: "destructive" })
    }
  }

  // (Review handlers moved to <ReviewProvider> in contexts/review-context.tsx.)

  const handleEditSave = async (updatedItem: InventoryItem) => {
    try {
      const response = await fetchWithAuth(`/api/inventory/${updatedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedItem),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || "Failed to update inventory item")
      }

      const savedItem = (await response.json()) as InventoryItem

      setItems((prev) => prev.map((item) => (item.id === savedItem.id ? savedItem : item)))
      setEditItem(null)
      toast({
        title: "Item Updated",
        duration: 3000,
        description: `${savedItem.name} has been updated.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update inventory item"
      toastWithNudge({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      })
    }
  }

  const getCategories = () => {
    return Array.from(new Set(items.map((item) => item.category)))
  }

  // Count badges for filter pills
  const now = new Date()
  const expiredCount = items.filter((i) => i.expiryDate && new Date(i.expiryDate) < now).length
  const expiringSoonCount = items.filter((i) => {
    if (!i.expiryDate || isNaN(new Date(i.expiryDate).getTime())) return false
    const days = Math.ceil((new Date(i.expiryDate).getTime() - now.getTime()) / 86400000)
    return days >= 0 && days <= 7
  }).length
  const missingExpiryCount = items.filter((i) => !i.expiryDate || isNaN(new Date(i.expiryDate).getTime())).length

  // Check for expired items
  const hasExpiredItems = expiredCount > 0

  // Check for items with missing expiry dates
  const hasMissingExpiryItems = missingExpiryCount > 0

  // Bulk selection helpers
  const toggleItemSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkConsume = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    setIsBulkProcessing(true)
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth("/api/inventory/operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, action: "consume", addToShoppingList: false }),
          })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Consumed", duration: 3000, description: `${targets.length} item${targets.length !== 1 ? "s" : ""} marked as consumed.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Consume Failed", description: "Some items could not be updated.", variant: "destructive" })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleBulkWaste = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    setIsBulkProcessing(true)
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth("/api/inventory/operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, action: "waste" }),
          })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Wasted", duration: 3000, description: `${targets.length} item${targets.length !== 1 ? "s" : ""} marked as wasted.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Waste Failed", description: "Some items could not be updated.", variant: "destructive" })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleBulkDelete = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    setIsBulkProcessing(true)
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth(`/api/inventory/${item.id}`, { method: "DELETE" })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Deleted", duration: 3000, description: `${targets.length} item${targets.length !== 1 ? "s" : ""} removed.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Delete Failed", description: "Some items could not be deleted.", variant: "destructive" })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Kitchen Inventory</h1>
        <Link href="/profile">
          <button
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold hover:opacity-90 transition-opacity"
            aria-label="Go to profile"
          >
            {userInitials || "?"}
          </button>
        </Link>
      </div>

      <div className="mb-6 flex gap-2">
        <Button
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50"
          onClick={() => setShowMealPlanModal(true)}
          disabled={isLoading || items.length === 0}
        >
          <div className="relative">
            <ShoppingCart className="h-5 w-5" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300" />
          </div>
          <span>{items.length === 0 && !isLoading ? "Add items first" : "Meal Plan"}</span>
        </Button>
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => setShowRecipeImport(true)}
        >
          <ChefHat className="h-4 w-4" />
          <span>Import Recipe</span>
        </Button>
      </div>

      {emailIngestions.length > 0 && (
        <div className="mb-4">
          <EmailIngestionBanner
            ingestions={emailIngestions}
            onRefresh={() => {
              loadEmailIngestions()
              // Re-fetch inventory via the provider so the cache reflects any
              // items added during this flow.
              void refreshInventory()
            }}
          />
        </div>
      )}

      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg pt-2 pb-4 space-y-3 -mx-3 px-3 rounded-b-2xl">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search items"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
                <span className="sr-only">Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={activeFilter} onValueChange={setActiveFilter}>
                <DropdownMenuRadioItem value="all">All Items</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="expired">
                  <span className="flex items-center">
                    <AlertCircle className="mr-1 h-3.5 w-3.5 text-destructive" />
                    Expired Items
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="expiring-soon">
                  <span className="flex items-center">
                    <AlertCircle className="mr-1 h-3.5 w-3.5 text-warning" />
                    Expiring Soon
                  </span>
                </DropdownMenuRadioItem>
                {hasMissingExpiryItems && (
                  <DropdownMenuRadioItem value="missing-expiry">
                    <span className="flex items-center">
                      <Clock className="mr-1 h-3.5 w-3.5 text-warning" />
                      Missing Expiry Date
                    </span>
                  </DropdownMenuRadioItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Categories</DropdownMenuLabel>
                {getCategories().map((category) => (
                  <DropdownMenuRadioItem key={category} value={category}>
                    {category}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
                <DropdownMenuRadioItem value="expiryDate">Expiry Date</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="addedOn">Recently Added</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="category">Category</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="location">Location</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
            <Button
              variant={activeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("all")}
              className="min-w-fit"
            >
              All Items
              {items.length > 0 && (
                <span className="ml-1.5 text-xs font-normal opacity-70">{items.length}</span>
              )}
            </Button>

            {hasExpiredItems && (
              <Button
                variant={activeFilter === "expired" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter("expired")}
                className="min-w-fit text-destructive border-destructive/30"
              >
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                Expired
                <span className="ml-1.5 text-xs font-normal opacity-70">{expiredCount}</span>
              </Button>
            )}

            <Button
              variant={activeFilter === "expiring-soon" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("expiring-soon")}
              className="min-w-fit text-warning border-warning/30"
            >
              <AlertCircle className="mr-1 h-3.5 w-3.5" />
              Expiring Soon
              {expiringSoonCount > 0 && (
                <span className="ml-1.5 text-xs font-normal opacity-70">{expiringSoonCount}</span>
              )}
            </Button>

            {hasMissingExpiryItems && (
              <Button
                variant={activeFilter === "missing-expiry" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter("missing-expiry")}
                className="min-w-fit text-warning border-warning/30"
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                Set Expiry
                <span className="ml-1.5 text-xs font-normal opacity-70">{missingExpiryCount}</span>
              </Button>
            )}

            {getCategories().map((category) => (
              <Button
                key={category}
                variant={activeFilter === category ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(category)}
                className="min-w-fit"
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Select Items / Cancel Selection — hidden when list is empty */}
          {filteredItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            >
              {selectionMode ? "Cancel" : "Select"}
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar — only visible in selection mode */}
      {selectionMode && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg mb-4">
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
            onChange={toggleSelectAll}
          />
          <span className="text-sm flex-1 text-muted-foreground">
            {selectedIds.size} of {filteredItems.length} selected
          </span>
          <LoadingButton
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={selectedIds.size === 0}
            isLoading={isBulkProcessing}
            onClick={handleBulkConsume}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Consume
          </LoadingButton>
          <LoadingButton
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={selectedIds.size === 0}
            isLoading={isBulkProcessing}
            onClick={handleBulkWaste}
          >
            <Trash className="h-3.5 w-3.5 mr-1" />
            Waste
          </LoadingButton>
          <LoadingButton
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-destructive hover:text-destructive"
            disabled={selectedIds.size === 0}
            isLoading={isBulkProcessing}
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </LoadingButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-20">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                  <div className="h-6 bg-muted rounded w-16" />
                </div>
                <div className="mt-3 pt-3 border-t">
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
            <LoadingTip />
            <div className="rounded-lg border p-4 animate-pulse">
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
                <div className="h-6 bg-muted rounded w-16" />
              </div>
              <div className="mt-3 pt-3 border-t">
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground mb-4">
              {items.length === 0 ? "Your inventory is empty" : "No items match your search"}
            </p>
            <Button asChild>
              <Link href="/add-item">Add New Item</Link>
            </Button>
          </div>
        ) : (
          arrangeIntoClusters(filteredItems).map(({ item, isIndented }, i) => {
            const isExpired = new Date(item.expiryDate) < new Date()
            const isMissingExpiry = !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())
            const daysUntilExpiry = isMissingExpiry ? Infinity : Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24))

            return (
              <AnimatedItem key={item.id} index={i}>
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg",
                  // Threading: continuation cards of a same-name cluster are
                  // indented to make the group visually obvious. See
                  // arrangeIntoClusters() — leader card stays flush, only
                  // 2nd+ members get this class.
                  isIndented && "ml-4",
                )}
                style={{ touchAction: "pan-y" }}
                onTouchStart={(e) => handleTouchStart(e, item.id)}
                onTouchMove={(e) => handleTouchMove(e, item.id)}
                onTouchEnd={() => handleTouchEnd(item.id)}
              >
                {/* Left action panel: Wasted + Delete (revealed by swiping LEFT) */}
                <div className="absolute inset-y-0 right-0 flex z-0">
                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 w-24 bg-warning text-warning-foreground active:brightness-90"
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => handleSwipeAction(item.id, "waste")}
                  >
                    <Trash className="h-5 w-5" />
                    <span className="text-xs font-medium">Wasted</span>
                  </button>
                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 w-24 bg-destructive text-destructive-foreground active:brightness-90"
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => handleSwipeAction(item.id, "delete")}
                  >
                    <Trash2 className="h-5 w-5" />
                    <span className="text-xs font-medium">Delete</span>
                  </button>
                </div>

                {/* Right action panel: Consumed (revealed by swiping RIGHT) */}
                <div className="absolute inset-y-0 left-0 z-0">
                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 h-full w-28 bg-success text-success-foreground active:brightness-90"
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => handleSwipeAction(item.id, "consumed")}
                  >
                    <Check className="h-5 w-5" />
                    <span className="text-xs font-medium">Consumed</span>
                  </button>
                </div>

                {/* Card slider — sits on top, slides to reveal panels */}
                <div
                  ref={(el) => {
                    if (el) cardSliderRefs.current.set(item.id, el)
                    else cardSliderRefs.current.delete(item.id)
                  }}
                  className="relative z-10"
                >
                <Card
                  className={`rounded-none border-0 border-l-4 ${getExpiryColor(item.expiryDate)} relative cursor-pointer ${
                    selectionMode && selectedIds.has(item.id) ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => {
                    if (justClosedSwipeRef.current) {
                      justClosedSwipeRef.current = false
                      return
                    }
                    selectionMode ? toggleItemSelection(item.id) : setDetailItem(item)
                  }}
                >
                  {(isExpired || (!isMissingExpiry && daysUntilExpiry <= 3)) && (
                    <span className={cn(
                      "absolute top-3 right-3 h-2.5 w-2.5 rounded-full z-10",
                      isExpired ? "bg-destructive" : "bg-warning",
                    )}>
                      <span className={cn(
                        "absolute inset-0 rounded-full animate-ping",
                        isExpired ? "bg-destructive" : "bg-warning",
                      )} />
                    </span>
                  )}
                  <CardContent className="p-3 pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {selectionMode && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded mt-0.5 shrink-0"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium line-clamp-2 leading-snug">{item.name}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.brand && <span className="font-medium">{item.brand} · </span>}
                            {item.location}
                            {(item.quantity ?? 0) >= 1 && (
                              <>
                                {" · "}
                                {item.unit && item.unit !== "pcs"
                                  ? `${item.quantity}${item.unit}`
                                  : (item.quantity ?? 0) > 1 ? `×${item.quantity}` : null}
                              </>
                            )}
                          </p>
                          {(item.rating ?? 0) > 0 ? (
                            <StarRating value={item.rating!} size="sm" readOnly />
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 shrink-0 ml-2">
                        <Badge variant="outline">{item.category}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                              <span className="sr-only">Open menu</span>
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 15 15"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                              >
                                <path
                                  d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                                  fill="currentColor"
                                  fillRule="evenodd"
                                  clipRule="evenodd"
                                ></path>
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditItem(item) }}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleConsumeItem(item) }}>
                              <Check className="mr-2 h-4 w-4" />
                              <span>Mark as Consumed</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleWasteItem(item) }}>
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Mark as Wasted</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteItem(item) }}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {isExpired && (
                      <div className="mt-1.5 text-destructive text-xs flex items-center">
                        <AlertCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                        {formatDaysLeft(item.expiryDate)}
                      </div>
                    )}
                    {isMissingExpiry && (
                      <div className="mt-1.5 text-warning text-xs flex items-center">
                        <Clock className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span>Set expiry date</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 ml-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); setEditItem(item) }}
                        >
                          Set Now
                        </Button>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="border-t pt-2 pb-2 px-3 text-xs text-muted-foreground">
                    {!isExpired && !isMissingExpiry && (
                      <span>{formatDaysLeft(item.expiryDate)}</span>
                    )}
                  </CardFooter>
                </Card>
                </div>{/* end card slider */}
              </div>
              </AnimatedItem>
            )
          })
        )}
      </div>

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>Update the details of your inventory item.</DialogDescription>
          </DialogHeader>

          {editItem && <EditItemForm item={editItem} onSave={handleEditSave} onCancel={() => setEditItem(null)} />}
        </DialogContent>
      </Dialog>

      {/* Review chip + full-review sheet now live in <ReviewProvider> (app-level)
          so they survive navigation. See contexts/review-context.tsx. */}

      {/* Item Detail Sheet */}
      <ItemDetailSheet
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        onEdit={(item) => setEditItem(item)}
        onDelete={(item) => { setDetailItem(null); handleDeleteItem(item) }}
        onPartialConsume={(item, spec) => { setDetailItem(null); void handlePartialConsume(item, spec) }}
      />

      {/* Bug Report Dialog (opened contextually after errors) */}
      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />

      {/* Meal Plan Generator Modal */}
      <Dialog open={showMealPlanModal} onOpenChange={setShowMealPlanModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="mr-2 h-5 w-5" />
              <Sparkles className="mr-2 h-4 w-4 text-yellow-400" />
              AI Meal Plan Generator
            </DialogTitle>
            <DialogDescription>Create a personalized meal plan based on your inventory items</DialogDescription>
          </DialogHeader>

          <MealPlanGenerator items={items} onClose={() => setShowMealPlanModal(false)} />
        </DialogContent>
      </Dialog>

      {/* Recipe Import Sheet */}
      <RecipeImportSheet
        open={showRecipeImport}
        onOpenChange={setShowRecipeImport}
        onRecipeReady={(data) => {
          setShowRecipeImport(false)
          setRecipeReviewData(data)
        }}
        onGoHome={() => {
          setShowRecipeImport(false)
          router.push("/recipes")
        }}
      />

      {/* Recipe Review Screen (full-screen overlay) */}
      {recipeReviewData && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <RecipeReviewScreen
            importId={recipeReviewData.importId}
            recipe={recipeReviewData.recipe}
            pantryMatches={recipeReviewData.pantryMatches}
            compatibilityScore={recipeReviewData.compatibilityScore}
            sourceUrl={recipeReviewData.sourceUrl}
            sourcePlatform={recipeReviewData.sourcePlatform}
            onBack={() => setRecipeReviewData(null)}
            onSaved={() => setRecipeReviewData(null)}
          />
        </div>
      )}
    </MainLayout>
  )
}
