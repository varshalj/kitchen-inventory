"use client"

import { useMemo } from "react"
import { ShoppingCart, Info, Plus, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { addInventoryItem } from "@/lib/client/api"
import type { InventoryItem } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MainLayout } from "@/components/main-layout"

interface SmartSuggestionsProps {
  items: InventoryItem[]
  standalone?: boolean
}

interface ShoppingListSuggestion {
  id: string
  name: string
  category: string
  reason: string
}

export function SmartSuggestions({ items, standalone = false }: SmartSuggestionsProps) {
  const { toast } = useToast()

  const suggestions = useMemo(() => {
    // Get expiring items (within 3 days)
    const expiringItems = items.filter((item) => {
      const daysUntilExpiry = Math.ceil(
        (new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
      )
      return daysUntilExpiry <= 3 && daysUntilExpiry > 0
    })

    // Get already expired items
    const expiredItems = items.filter((item) => {
      return new Date(item.expiryDate) < new Date()
    })

    const frequentlyUsedItems = items.filter((item) => item.lastUsedOn || item.partiallyConsumed).slice(0, 3)

    const lowStockItems = items
      .filter((item) => (item.quantity || 0) <= 1 && !item.archived)
      .slice(0, 5)
      .map((item, i) => ({
        id: `low-${i}`,
        name: item.name,
        category: item.category,
        reason: `Low stock (${item.quantity || 0} remaining)`,
      }))

    const consumedItems = items
      .filter((item) => item.consumedOn && item.archived)
      .slice(0, 3)
      .map((item, i) => ({
        id: `consumed-${i}`,
        name: item.name,
        category: item.category,
        reason: "Previously consumed - may need restocking",
      }))

    const shoppingListSuggestions = [...lowStockItems, ...consumedItems]
      .filter(
        (suggestion, index, self) =>
          self.findIndex((s) => s.name.toLowerCase() === suggestion.name.toLowerCase()) === index,
      )
      .filter(
        (suggestion) =>
          !items.some(
            (item) =>
              item.name.toLowerCase() === suggestion.name.toLowerCase() &&
              !item.archived &&
              (item.quantity || 0) > 1,
          ),
      )
      .slice(0, 5)

    return {
      expiringItems,
      expiredItems,
      frequentlyUsedItems,
      shoppingListSuggestions,
    }
  }, [items])

  const handleAddToInventory = async (suggestion: ShoppingListSuggestion) => {
    const { item: createdItem } = await addInventoryItem({
      name: suggestion.name,
      category: suggestion.category,
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Refrigerator",
      quantity: 1,
      addedOn: new Date().toISOString(),
    } as unknown as InventoryItem)

    toast({
      title: "Item Added",
      description: `${createdItem.name} has been added to your inventory.`,
    })
  }

  if (standalone) {
    return (
      <MainLayout>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center">
            <ShoppingCart className="mr-2 h-5 w-5" />
            Smart Suggestions
          </h1>
        </div>

        <div className="space-y-6 mb-20">
          {suggestions.expiredItems.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center text-red-500">
                  <Info className="mr-2 h-4 w-4" />
                  Expired Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {suggestions.expiredItems.map((item) => (
                    <Badge key={item.id} variant="outline" className="bg-red-50 text-red-600 border-red-200">
                      {item.name} ({new Date(item.expiryDate).toLocaleDateString()})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {suggestions.expiringItems.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center text-amber-500">
                  <Info className="mr-2 h-4 w-4" />
                  Use Soon
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {suggestions.expiringItems.map((item) => (
                    <Badge key={item.id} variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                      {item.name} ({new Date(item.expiryDate).toLocaleDateString()})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Shopping List Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suggestions.shoppingListSuggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your inventory looks well-stocked!</p>
              ) : (
                <div className="space-y-2">
                  {suggestions.shoppingListSuggestions.map((suggestion) => (
                    <div key={suggestion.id} className="flex items-center justify-between p-2 border rounded-md">
                      <div>
                        <div className="font-medium">{suggestion.name}</div>
                        <div className="text-xs text-muted-foreground">{suggestion.reason}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => handleAddToInventory(suggestion)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-3">
              <Button variant="link" className="ml-auto p-0 h-auto text-xs" asChild>
                <Link href="/shopping-list">
                  View Full Shopping List
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Info className="mr-2 h-4 w-4" />
                Meal Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Recipes based on expiring items in your inventory</p>

              <ScrollArea className="h-48">
                <div className="space-y-3">
                  {suggestions.expiringItems.length > 0 ? (
                    <div className="border rounded-md p-3">
                      <p className="text-sm text-muted-foreground">
                        You have {suggestions.expiringItems.length} item{suggestions.expiringItems.length > 1 ? "s" : ""} expiring soon:
                        {" "}{suggestions.expiringItems.map((item) => item.name).join(", ")}.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Use the Meal Plan Generator on the dashboard to get AI-powered recipe suggestions based on these items.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No items expiring soon. Your inventory is in good shape.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Smart Suggestions
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Info className="h-4 w-4" />
                  <span className="sr-only">Info</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Suggestions based on your consumption patterns, expiring items, and typical shopping habits.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.expiringItems.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Use Soon</h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.expiringItems.map((item) => (
                <Badge key={item.id} variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                  {item.name} ({new Date(item.expiryDate).toLocaleDateString()})
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-2">Shopping List Suggestions</h3>
          {suggestions.shoppingListSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your inventory looks well-stocked!</p>
          ) : (
            <div className="space-y-2">
              {suggestions.shoppingListSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="flex items-center justify-between p-2 border rounded-md">
                  <div>
                    <div className="font-medium">{suggestion.name}</div>
                    <div className="text-xs text-muted-foreground">{suggestion.reason}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => handleAddToInventory(suggestion)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="border-t pt-3">
        <Button variant="link" className="ml-auto p-0 h-auto text-xs" asChild>
          <Link href="/shopping-list">
            View Full Shopping List
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
