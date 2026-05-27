"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { ReviewChip } from "@/components/review-chip"
import { ReviewPrompt } from "@/components/review-prompt"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { fetchWithAuth } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import type { InventoryItem } from "@/lib/types"

/**
 * App-level provider for the post-consume / post-waste rating flow.
 *
 * Lifted from inventory-dashboard so that:
 *   1. The 5.5s queueing timer survives page navigation. Previously a user
 *      who consumed an item and switched to /shopping-list before the timer
 *      fired would silently lose the chip — the dashboard had unmounted and
 *      `setReviewQueue` on an unmounted component was dropped by React.
 *   2. The ReviewChip and "Share more feedback" Sheet are visible on every
 *      route, so the user can never miss a queued prompt.
 *
 * Trade-off vs. earlier "dashboard-only" decision: the chip will now show
 * on /shopping-list, /recipes, /profile, etc. Dismiss is one tap, so the
 * cost of seeing it on a non-inventory tab is low and the data-loss bug it
 * prevents is real. See cross-cutting design discussion.
 */

const REVIEW_DELAY_MS = 5500

type QueueEntry = { item: InventoryItem; type: "consumed" | "wasted" }

interface ReviewContextValue {
  /**
   * Schedule an inventory item to surface in the rating chip after the undo
   * window (5.5s) closes. Idempotent for the same itemId — re-queuing cancels
   * the previous pending timer. No-op if the item already has a rating or
   * was previously dismissed (reviewDismissedAt is set).
   */
  queueForReview: (item: InventoryItem, type: "consumed" | "wasted") => void
  /**
   * Cancel a pending timer for an item. Called when the user undoes the
   * action that would have queued the review (e.g., undo-consume toast).
   */
  cancelPending: (itemId: string) => void
}

const ReviewContext = createContext<ReviewContextValue | null>(null)

export function useReview() {
  const ctx = useContext(ReviewContext)
  if (!ctx) {
    throw new Error("useReview must be used inside <ReviewProvider>")
  }
  return ctx
}

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [reviewQueue, setReviewQueue] = useState<QueueEntry[]>([])
  // When true, the full "Share more feedback" sheet is open. The chip stays
  // mounted but hidden behind the sheet's overlay (item={null}).
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false)
  // Pending timers keyed by inventory item id. Allows cancellation on undo.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const { toast } = useToast()

  const reviewItem = reviewQueue[0] ?? null

  // ─── External API ────────────────────────────────────────────────────────

  const queueForReview = useCallback((item: InventoryItem, type: "consumed" | "wasted") => {
    // Skip items that have already been rated or explicitly dismissed.
    if (item.rating || item.reviewDismissedAt) return

    // Defensive: cancel any prior pending timer for the same item before
    // scheduling a new one. (Shouldn't happen in normal flow but guards
    // against double-clicks or rapid consume/undo cycles.)
    const existing = pendingTimers.current.get(item.id)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      pendingTimers.current.delete(item.id)
      setReviewQueue((prev) => [...prev, { item, type }])
    }, REVIEW_DELAY_MS)

    pendingTimers.current.set(item.id, timer)
  }, [])

  const cancelPending = useCallback((itemId: string) => {
    const timer = pendingTimers.current.get(itemId)
    if (timer) {
      clearTimeout(timer)
      pendingTimers.current.delete(itemId)
    }
  }, [])

  // ─── Chip handlers ───────────────────────────────────────────────────────

  const handleChipRate = useCallback(async (rating: number) => {
    if (!reviewItem) return
    await fetchWithAuth(`/api/inventory/${reviewItem.item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        ratedAt: new Date().toISOString(),
      }),
    })
  }, [reviewItem])

  const handleChipDismiss = useCallback(async () => {
    if (!reviewItem) return
    try {
      await fetchWithAuth(`/api/inventory/${reviewItem.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewDismissedAt: new Date().toISOString(),
        }),
      })
    } catch {
      // Non-fatal — worst case we re-prompt next session.
    }
    setReviewQueue((prev) => prev.slice(1))
  }, [reviewItem])

  const handleChipShareMoreFeedback = useCallback(() => {
    setReviewSheetOpen(true)
  }, [])

  const handleChipAdvance = useCallback(() => {
    setReviewQueue((prev) => prev.slice(1))
  }, [])

  // ─── Sheet handlers ──────────────────────────────────────────────────────

  const handleReviewSubmit = useCallback(
    async (review: { rating: number; reviewTags: string[]; reviewNote: string }) => {
      if (!reviewItem) return
      await fetchWithAuth(`/api/inventory/${reviewItem.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: review.rating,
          reviewTags: review.reviewTags,
          reviewNote: review.reviewNote,
          ratedAt: new Date().toISOString(),
        }),
      })
      // Sheet save advances the queue AND closes the sheet — same item is done.
      setReviewSheetOpen(false)
      setReviewQueue((prev) => prev.slice(1))
      toast({
        title: "Review Saved",
        duration: 3000,
        description: "Your rating will help personalize future recommendations.",
      })
    },
    [reviewItem, toast],
  )

  const handleReviewSkip = useCallback(() => {
    // Sheet close-without-save returns to the chip's Thanks state for the
    // same item. Rating is already persisted (from stage 1), so just close
    // the sheet — queue stays put.
    setReviewSheetOpen(false)
  }, [])

  return (
    <ReviewContext.Provider value={{ queueForReview, cancelPending }}>
      {children}

      {/* Chip — visible on every route. Hidden while the sheet is open. */}
      <ReviewChip
        item={reviewItem && !reviewSheetOpen ? reviewItem.item : null}
        onRate={handleChipRate}
        onDismiss={handleChipDismiss}
        onShareMoreFeedback={handleChipShareMoreFeedback}
        onAdvance={handleChipAdvance}
      />

      {/* Full review sheet — opens via the chip's "Share more feedback" link. */}
      <Sheet open={reviewSheetOpen} onOpenChange={(open) => !open && setReviewSheetOpen(false)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add more detail</SheetTitle>
            <SheetDescription>
              Help yourself remember what to reorder next time.
            </SheetDescription>
          </SheetHeader>
          {reviewItem && (
            <div className="px-4 pb-4">
              <ReviewPrompt
                key={reviewItem.item.id}
                item={reviewItem.item}
                type={reviewItem.type}
                onSubmit={handleReviewSubmit}
                onSkip={handleReviewSkip}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ReviewContext.Provider>
  )
}
