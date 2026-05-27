"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/star-rating"
import type { InventoryItem } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Non-intrusive rating chip — replaces the modal-based ReviewPrompt for the
 * primary rating flow. Inspired by Zomato's post-delivery rating chip.
 *
 * Two-stage interaction:
 *   1. INITIAL  — shows item name + 5 empty stars + X. User taps a star.
 *   2. THANKS   — shows item name + 5 filled stars + "Share more feedback" +
 *                  X. Persists until user X-dismisses or taps the link.
 *
 * Tapping a star saves the rating immediately via the parent's `onRate`.
 * Tapping X persists `review_dismissed_at` via `onDismiss` (stage 1 only —
 * stage 2 X just advances the queue, rating is already saved).
 *
 * The chip sits above the bottom-nav (which is fixed at z-50). We use z-40 so
 * it stays below toasts (z-100) but above the scrollable inventory list.
 *
 * If `item` is null the chip renders nothing — caller controls visibility by
 * passing the next queue item.
 */

export interface ReviewChipProps {
  item: InventoryItem | null
  /** Save the given rating; advances chip from INITIAL → THANKS state. */
  onRate: (rating: number) => Promise<void>
  /** User X-dismissed before rating. Persist dismissal + advance queue. */
  onDismiss: () => Promise<void>
  /** User wants to add tags/note. Caller opens the full ReviewPrompt sheet. */
  onShareMoreFeedback: () => void
  /** After "Share more feedback" sheet closes, caller resets to advance queue. */
  onAdvance: () => void
}

type Stage = "initial" | "thanks"

export function ReviewChip({ item, onRate, onDismiss, onShareMoreFeedback, onAdvance }: ReviewChipProps) {
  const [stage, setStage] = useState<Stage>("initial")
  const [pendingRating, setPendingRating] = useState(0)
  const [busy, setBusy] = useState(false)

  // ── Reset stage whenever the chip is given a new item to surface. ──
  // ── The id check keeps the stage stable while a sheet is open. ──
  useEffect(() => {
    if (item) {
      setStage("initial")
      setPendingRating(0)
    }
  }, [item?.id])

  if (!item) return null

  const displayName = [item.brand, item.name].filter(Boolean).join(" ")

  const handleStarTap = async (rating: number) => {
    if (busy || rating <= 0) return
    setBusy(true)
    try {
      setPendingRating(rating)
      await onRate(rating)
      setStage("thanks")
    } catch {
      // Roll back optimistic state on failure
      setPendingRating(0)
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (stage === "initial") {
        // No rating given — persist the dismissal so we don't re-surface.
        await onDismiss()
      } else {
        // Rating already saved in stage 1. Just advance the queue.
        onAdvance()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      // Position above bottom-nav (56px) + safe-area padding. z-40 keeps the
      // chip below toasts (z-100) and dialog overlays.
      className={cn(
        "fixed left-4 right-4 z-40",
        "pointer-events-none",
      )}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      <div
        className={cn(
          "pointer-events-auto rounded-xl border border-border bg-card/95 backdrop-blur",
          "shadow-lg shadow-black/10",
          "px-3 py-2.5",
          "flex items-center gap-3",
          "transition-all duration-200",
        )}
        role="dialog"
        aria-label={stage === "initial" ? `Rate ${displayName}` : `Thanks for rating ${displayName}`}
      >
        {/* Left column: item name + state-dependent subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          {stage === "initial" ? (
            <p className="text-xs text-muted-foreground">How was it?</p>
          ) : (
            <button
              type="button"
              onClick={onShareMoreFeedback}
              className="text-xs text-primary hover:underline"
              disabled={busy}
            >
              Share more feedback ›
            </button>
          )}
        </div>

        {/* Right column: stars + dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <StarRating
            value={stage === "thanks" ? pendingRating : 0}
            onChange={stage === "initial" ? handleStarTap : undefined}
            readOnly={stage === "thanks" || busy}
            size="sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleDismiss}
            disabled={busy}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
