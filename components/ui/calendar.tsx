"use client"

import * as React from "react"

export type CalendarProps = {
  selected?: Date
  onSelect?: (date?: Date) => void
  className?: string
}

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  return (
    <div className={className}>
      <input
        type="date"
        value={selected ? selected.toISOString().split("T")[0] : ""}
        onChange={(event) => {
          const value = event.target.value
          onSelect?.(value ? new Date(`${value}T00:00:00`) : undefined)
        }}
      />
    </div>
  )
}
