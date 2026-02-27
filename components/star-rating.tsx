"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: "sm" | "md" | "lg"
  readOnly?: boolean
  className?: string
}

export function StarRating({ value, onChange, size = "md", readOnly = false, className }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0)

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
  }

  const gapClasses = {
    sm: "gap-0.5",
    md: "gap-1",
    lg: "gap-1.5",
  }

  const handleClick = (star: number) => {
    if (readOnly) return
    // Clicking the same star again clears the rating
    onChange?.(star === value ? 0 : star)
  }

  const displayValue = hoverValue || value

  return (
    <div
      className={cn("flex items-center", gapClasses[size], className)}
      onMouseLeave={() => !readOnly && setHoverValue(0)}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={`Rating: ${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            className={cn(
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
              readOnly ? "cursor-default" : "cursor-pointer"
            )}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              className={cn(
                sizeClasses[size],
                "transition-colors",
                isFilled
                  ? "fill-amber-400 text-amber-400"
                  : readOnly
                    ? "fill-muted text-muted"
                    : "fill-muted text-muted hover:fill-amber-200 hover:text-amber-200"
              )}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
