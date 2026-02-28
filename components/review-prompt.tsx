"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "@/components/star-rating"
import type { InventoryItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const REVIEW_TAGS = [
  "Great taste",
  "Poor quality",
  "Good value",
  "Too expensive",
  "Would reorder",
  "Wouldn't reorder",
  "Fresh",
  "Stale/bad",
]

interface ReviewPromptProps {
  item: InventoryItem
  type: "consumed" | "wasted"
  onSubmit: (review: { rating: number; reviewTags: string[]; reviewNote: string }) => void
  onSkip: () => void
}

export function ReviewPrompt({ item, type, onSubmit, onSkip }: ReviewPromptProps) {
  const [rating, setRating] = useState(item.rating || 0)
  const [selectedTags, setSelectedTags] = useState<string[]>(item.reviewTags || [])
  const [note, setNote] = useState(item.reviewNote || "")

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = () => {
    onSubmit({ rating, reviewTags: selectedTags, reviewNote: note })
  }

  const displayName = [item.brand, item.name].filter(Boolean).join(" ")
  const sourceInfo = item.orderedFrom ? ` from ${item.orderedFrom}` : ""

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">
          {type === "consumed" ? "You finished" : "You discarded"}
        </p>
        <p className="font-semibold text-lg text-balance">{displayName}{sourceInfo}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium">How was it?</p>
        <StarRating value={rating} onChange={setRating} size="lg" />
        {rating > 0 && (
          <p className="text-xs text-muted-foreground">
            {rating <= 2 ? "Not great" : rating === 3 ? "It was okay" : rating === 4 ? "Pretty good" : "Excellent!"}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quick tags</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-foreground border-border hover:bg-muted"
                )}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Note (optional)</p>
        <Textarea
          placeholder="Anything to remember for next time..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onSkip}>
          Skip
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={rating === 0}>
          Save Review
        </Button>
      </div>
    </div>
  )
}
