"use client"

import { useMemo } from "react"
import { ShoppingCart, Info, Plus, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { type InventoryItem, addInventoryItem } from "@/lib/data"
import { useToast } from "@/hooks/use-toast"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MainLayout } from "@/components/main-layout"

interface SmartSuggestionsProps {
  items: InventoryItem[]
  standalone?: boolean
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

    // Get frequently used items (based on usage history)
    // In a real app, this would be based on actual usage patterns
    const frequentlyUsedItems = items.filter((item) => item.lastUsedOn || item.partiallyUsed).slice(0, 3)

    // Generate shopping list suggestions
    // This would be more sophisticated in a real app
    const shoppingListSuggestions = [
      {
        id: "s1",
        name: "Milk",
        category: "Dairy",
        reason: "Running low based on usage patterns",
      },
      {
        id: "s2",
        name: "Eggs",
        category: "Dairy",
        reason: "Used frequently in your recipes",
      },
      {
        id: "s3",
        name: "Bread",
        category: "Grains",
        reason: "You typically buy this weekly",
      },
    ]

    // Filter out items that are already in inventory
    const filteredSuggestions = shoppingListSuggestions.filter(
      (suggestion) =>
        !items.some((item) => item.name.toLowerCase() === suggestion.name.toLowerCase() && (item.quantity || 0) > 0),
    )

    return {
      expiringItems,
      expiredItems,
      frequentlyUsedItems,
      shoppingListSuggestions: filteredSuggestions,
    }
  }, [items])

  const handleAddToInventory = (suggestion: any) => {
    const newItem: InventoryItem = {
      id: Date.now().toString(),
      name: suggestion.name,
      category: suggestion.category,
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Refrigerator",
      quantity: 1,
      addedOn: new Date().toISOString(),
    }

    addInventoryItem(newItem)

    toast({
      title: "Item Added",
      description: `${suggestion.name} has been added to your inventory.`,
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
                    <>
                      <div className="border rounded-md p-3">
                        <h3 className="font-medium">Spinach and Egg Frittata</h3>
                        <p className="text-xs text-muted-foreground mt-1">Uses: Eggs, Spinach, Milk</p>
                      </div>
                      <div className="border rounded-md p-3">
                        <h3 className="font-medium">Apple Cinnamon Oatmeal</h3>
                        <p className="text-xs text-muted-foreground mt-1">Uses: Apples, Milk</p>
                      </div>
                      <div className="border rounded-md p-3">
                        <h3 className="font-medium">Chicken Pasta Bake</h3>
                        <p className="text-xs text-muted-foreground mt-1">Uses: Chicken Breast, Pasta, Tomato Sauce</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No recipes available based on your current inventory.
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
