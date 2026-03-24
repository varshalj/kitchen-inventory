"use client"

import { ExternalLink, ShoppingBag, Star, Zap, ShoppingCart, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

const TAB_CONFIG = [
  { key: "quick" as const, label: "Quick", icon: Zap },
  { key: "grocery" as const, label: "Grocery", icon: ShoppingCart },
  { key: "shop" as const, label: "Shop", icon: Store },
]

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

  const prioritizedSources = new Set(userOrderSources.map((s) => s.toLowerCase()))

  const sortPlatforms = (list: GroceryPlatform[]) =>
    [...list].sort((a, b) => {
      const aMatch = prioritizedSources.has(a.name.toLowerCase()) ? 0 : 1
      const bMatch = prioritizedSources.has(b.name.toLowerCase()) ? 0 : 1
      return aMatch - bMatch
    })

  const handleOpenPlatform = (platform: GroceryPlatform) => {
    window.open(platform.searchUrl(query), "_blank", "noopener,noreferrer")
  }

  const renderPlatformGrid = (category: GroceryPlatform["category"]) => {
    const platforms = sortPlatforms(enabledPlatforms.filter((p) => p.category === category))
    if (platforms.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-6">
          No platforms configured for this tab. Go to Profile Settings to enable platforms.
        </p>
      )
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        {platforms.map((platform) => {
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
    )
  }

  // Default to the tab containing the previously-used platform, or "quick"
  const defaultTab = previousPlatform?.category ?? "quick"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[80vh]">
        <div className="flex-1 min-h-0 overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Buy {item.brand ? `${item.brand} ${item.name}` : item.name}
          </SheetTitle>
          <SheetDescription>
            Searching for &quot;{query}&quot;
            {item.quantity > 1 && (
              item.unit && item.unit !== "pcs"
                ? ` (${item.quantity}${item.unit})`
                : ` (qty: ${item.quantity})`
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {previousPlatform && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pb-3 mb-3 border-b">
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              <span>Previously ordered from <strong>{item.orderedFrom}</strong></span>
            </div>
          )}

          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full mb-4">
              {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="flex-1 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {TAB_CONFIG.map(({ key }) => (
              <TabsContent key={key} value={key}>
                {renderPlatformGrid(key)}
              </TabsContent>
            ))}
          </Tabs>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
