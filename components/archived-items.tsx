"use client"

import { useState, useEffect } from "react"
import { Archive, ShoppingCart, Trash, ArrowLeft, ChevronDown, Star, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MainLayout } from "@/components/main-layout"
import { getArchivedItems } from "@/lib/client/api"
import type { InventoryItem } from "@/lib/types"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function ArchivedItems() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const load = async () => {
      try {
        const archivedItems = await getArchivedItems()
        setItems(archivedItems)
      } catch {
        setItems([])
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  const consumedItems = items.filter((item) => item.archiveReason === "consumed")
  const wastedItems = items.filter((item) => item.archiveReason === "wasted")
  const otherItems = items.filter((item) => item.archiveReason !== "consumed" && item.archiveReason !== "wasted")

  const getDisplayItems = () => {
    switch (activeTab) {
      case "consumed":
        return consumedItems
      case "wasted":
        return wastedItems
      case "other":
        return otherItems
      default:
        return items
    }
  }

  const displayItems = getDisplayItems()

  const getActionDate = (item: InventoryItem) => {
    if (item.consumedOn) return new Date(item.consumedOn).toLocaleDateString()
    if (item.wastedOn) return new Date(item.wastedOn).toLocaleDateString()
    if (item.addedOn) return new Date(item.addedOn).toLocaleDateString()
    return "Unknown"
  }

  return (
    <MainLayout>
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" className="mr-2" asChild>
          <Link href="/profile">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex items-center">
          <Archive className="mr-2 h-5 w-5" />
          Archived Items
        </h1>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {items.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="consumed">
            Consumed
            <Badge variant="secondary" className="ml-2">
              {consumedItems.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="wasted">
            Wasted
            <Badge variant="secondary" className="ml-2">
              {wastedItems.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="other">
            Other
            <Badge variant="secondary" className="ml-2">
              {otherItems.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mb-20">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <div className="h-5 bg-muted rounded w-1/3" />
                      <div className="h-5 bg-muted rounded w-20" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No archived items found in this category.</div>
          ) : (
            <div className="space-y-3">
              {displayItems.map((item) => {
                const isExpanded = expandedIds.has(item.id)
                return (
                  <Card
                    key={item.id}
                    className="overflow-hidden cursor-pointer transition-all"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <CardTitle className="text-base truncate">{item.name}</CardTitle>
                          {item.rating && item.rating > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                              <Star className="h-3.5 w-3.5 fill-current" />
                              <span className="text-xs font-medium">{item.rating}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">
                            {item.archiveReason === "consumed" ? (
                              <span className="flex items-center text-green-600">
                                <ShoppingCart className="mr-1 h-3 w-3" />
                                Consumed
                              </span>
                            ) : item.archiveReason === "wasted" ? (
                              <span className="flex items-center text-red-600">
                                <Trash className="mr-1 h-3 w-3" />
                                Wasted
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <Archive className="mr-1 h-3 w-3" />
                                Archived
                              </span>
                            )}
                          </Badge>
                          <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>{getActionDate(item)}</span>
                        {item.orderedFrom && (
                          <>
                            <span className="text-muted-foreground/50">&middot;</span>
                            <span className="flex items-center gap-1">
                              <Store className="h-3 w-3" />
                              {item.orderedFrom}
                            </span>
                          </>
                        )}
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="pb-3 pt-0 border-t mt-2">
                        <div className="grid grid-cols-2 gap-2 text-sm pt-2">
                          <div>
                            <span className="text-muted-foreground">Category:</span> {item.category}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Location:</span> {item.location}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Expiry Date:</span>{" "}
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "Not set"}
                          </div>
                          {item.price && (
                            <div>
                              <span className="text-muted-foreground">Price:</span> {item.price}
                            </div>
                          )}
                          {item.brand && (
                            <div>
                              <span className="text-muted-foreground">Brand:</span> {item.brand}
                            </div>
                          )}
                          {item.notes && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Notes:</span> {item.notes}
                            </div>
                          )}
                          {item.reviewNote && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Review:</span> {item.reviewNote}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </MainLayout>
  )
}
