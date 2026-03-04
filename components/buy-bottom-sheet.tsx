"use client"

import { ExternalLink, ShoppingBag, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { GROCERY_PLATFORMS, buildSearchQuery, type GroceryPlatform } from "@/lib/grocery-platforms"
import type { ShoppingItem } from "@/lib/types"

interface BuyBottomSheetProps {
  item: ShoppingItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  enabledPlatformIds: string[]
  userOrderSources: string[]
}

function matchesPlatform(platform: GroceryPlatform, orderSource: string): boolean {
  const src = orderSource.toLowerCase()
  const name = platform.name.toLowerCase()
  const id = platform.id.toLowerCase()
  return name.includes(src) || src.includes(name) || id.includes(src)
}

export function BuyBottomSheet({
  item,
  open,
  onOpenChange,
  enabledPlatformIds,
  userOrderSources,
}: BuyBottomSheetProps) {
  if (!item) return null

  const query = buildSearchQuery(item)
  const enabledPlatforms = GROCERY_PLATFORMS.filter((p) => enabledPlatformIds.includes(p.id))

  const previousPlatform = item.orderedFrom
    ? enabledPlatforms.find((p) => matchesPlatform(p, item.orderedFrom!))
    : null

  const prioritizedSources = new Set(
    userOrderSources.map((s) => s.toLowerCase()),
  )
  const sorted = [...enabledPlatforms].sort((a, b) => {
    const aMatch = prioritizedSources.has(a.name.toLowerCase()) ? 0 : 1
    const bMatch = prioritizedSources.has(b.name.toLowerCase()) ? 0 : 1
    return aMatch - bMatch
  })

  const handleOpenPlatform = (platform: GroceryPlatform) => {
    const url = platform.searchUrl(query)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Buy {item.brand ? `${item.brand} ${item.name}` : item.name}
          </SheetTitle>
          <SheetDescription>
            Searching for &quot;{query}&quot;
            {item.quantity > 1 && ` (qty: ${item.quantity})`}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {previousPlatform && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              <span>Previously ordered from <strong>{item.orderedFrom}</strong></span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {sorted.map((platform) => {
              const isPrevious = previousPlatform?.id === platform.id
              return (
                <Button
                  key={platform.id}
                  variant={isPrevious ? "default" : "outline"}
                  className="h-auto py-3 px-4 flex flex-col items-center gap-1.5 relative"
                  onClick={() => handleOpenPlatform(platform)}
                >
                  <span className="font-medium text-sm">{platform.name}</span>
                  <span className="text-xs opacity-70 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {platform.website}
                  </span>
                  {isPrevious && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2 text-[10px] px-1.5">
                      Last used
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>

          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No delivery platforms configured. Go to Profile Settings to add platforms available in your area.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
