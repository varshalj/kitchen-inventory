"use client"

import { useState, useEffect } from "react"
import { Archive, ShoppingCart, Trash, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MainLayout } from "@/components/main-layout"
import { getArchivedItems } from "@/lib/client/api"
import type { InventoryItem } from "@/lib/types"
import Link from "next/link"

export function ArchivedItems() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [activeTab, setActiveTab] = useState("all")

  useEffect(() => {
    const load = async () => {
      const archivedItems = await getArchivedItems()
      setItems(archivedItems)
    }

    void load()
  }, [])

  // Filter items based on archive reason
  const consumedItems = items.filter((item) => (item.archived_reason ?? item.archiveReason) === "consumed")
  const wastedItems = items.filter((item) => (item.archived_reason ?? item.archiveReason) === "wasted")
  const otherItems = items.filter((item) => (item.archived_reason ?? item.archiveReason) !== "consumed" && (item.archived_reason ?? item.archiveReason) !== "wasted")

  // Get items to display based on active tab
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
          {displayItems.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No archived items found in this category.</div>
          ) : (
            <div className="space-y-4">
              {displayItems.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <Badge variant="outline">
                        {(item.archived_reason ?? item.archiveReason) === "consumed" ? (
                          <span className="flex items-center text-green-600">
                            <ShoppingCart className="mr-1 h-3 w-3" />
                            Consumed
                          </span>
                        ) : (item.archived_reason ?? item.archiveReason) === "wasted" ? (
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
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Category:</span> {item.category}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Location:</span> {item.location}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expiry Date:</span>{" "}
                        {new Date(item.expiryDate).toLocaleDateString()}
                      </div>
                      <div>
                        {item.consumedOn ? (
                          <>
                            <span className="text-muted-foreground">Consumed On:</span>{" "}
                            {new Date(item.consumedOn).toLocaleDateString()}
                          </>
                        ) : item.wastedOn ? (
                          <>
                            <span className="text-muted-foreground">Wasted On:</span>{" "}
                            {new Date(item.wastedOn).toLocaleDateString()}
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">Added On:</span>{" "}
                            {item.addedOn ? new Date(item.addedOn).toLocaleDateString() : "Unknown"}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </MainLayout>
  )
}
