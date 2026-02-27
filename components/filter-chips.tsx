"use client"

import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface FilterChipsProps {
  categories: string[]
  activeFilter: string
  setActiveFilter: (filter: string) => void
}

export function FilterChips({ categories, activeFilter, setActiveFilter }: FilterChipsProps) {
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex space-x-2 pb-1">
        <Badge
          variant={activeFilter === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setActiveFilter("all")}
        >
          All Items
        </Badge>

        <Badge
          variant={activeFilter === "expiring-soon" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setActiveFilter("expiring-soon")}
        >
          Expiring Soon
        </Badge>

        {categories.map((category) => (
          <Badge
            key={category}
            variant={activeFilter === category ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveFilter(category)}
          >
            {category}
          </Badge>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
