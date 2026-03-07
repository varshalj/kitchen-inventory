"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Edit, Plus, Trash2, ShoppingCart, ShoppingBag, Search, X, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ToastAction } from "@/components/ui/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { MainLayout } from "@/components/main-layout"
import { QuantityInput } from "@/components/quantity-input"
import { BuyBottomSheet } from "@/components/buy-bottom-sheet"
import { useUserSettings } from "@/hooks/use-user-settings"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import {
  getShoppingItems,
  updateShoppingItem,
  deleteShoppingItem,
  addToShoppingList,
  getInventoryItems,
  addInventoryItem,
  deleteInventoryItem,
} from "@/lib/client/api"
import type { ShoppingItem, InventoryItem } from "@/lib/types"
import { cn } from "@/lib/utils"

type SortBy = "recent" | "name" | "quantity"

export function ShoppingList() {
  const { toast } = useToast()
  const { settings } = useUserSettings()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [editItem, setEditItem] = useState<ShoppingItem | null>(null)
  const [buyItem, setBuyItem] = useState<ShoppingItem | null>(null)
  const [newItem, setNewItem] = useState({ name: "", quantity: 1, notes: "" })
  const [showCompleted, setShowCompleted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("recent")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const showBuyButton = settings?.country === "IN" && (settings?.deliveryPlatforms || []).length > 0

  useEffect(() => {
    const load = async () => {
      try {
        const [shoppingItems, invItems] = await Promise.all([
          getShoppingItems(),
          getInventoryItems(),
        ])
        setItems(shoppingItems)
        setInventoryItems(invItems)
      } catch {
        setItems([])
        setInventoryItems([])
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  // Compute typeahead suggestions from inventory + shopping history
  const computeSuggestions = useCallback(
    (query: string) => {
      if (!query.trim() || query.length < 1) {
        setSuggestions([])
        return
      }

      const q = query.toLowerCase()
      const activeNames = new Set(
        items.filter((i) => !i.completed).map((i) => i.name.toLowerCase())
      )

      const inventoryNames = inventoryItems.map((i) => i.name)
      const historyNames = items.map((i) => i.name)

      const allNames = [...inventoryNames, ...historyNames]
      const seen = new Set<string>()
      const results: string[] = []

      for (const name of allNames) {
        const lower = name.toLowerCase()
        // Skip if already in active list (exact match) or already added to suggestions
        if (activeNames.has(lower) && lower === q) continue
        if (seen.has(lower)) continue
        if (lower.includes(q)) {
          seen.add(lower)
          results.push(name)
          if (results.length >= 5) break
        }
      }

      setSuggestions(results)
    },
    [items, inventoryItems]
  )

  const handleNameChange = (value: string) => {
    setNewItem((prev) => ({ ...prev, name: value }))
    computeSuggestions(value)
    setShowSuggestions(true)
  }

  const handleSelectSuggestion = (name: string) => {
    setNewItem((prev) => ({ ...prev, name }))
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Feature 1 — Smart Duplicate Detection + add
  const handleAddItem = async () => {
    const name = newItem.name.trim()
    if (!name) return

    // Check for duplicates in current list
    const existing = items.find((i) => i.name.toLowerCase() === name.toLowerCase())

    if (existing) {
      if (!existing.completed) {
        // Incomplete duplicate → block
        triggerHaptic(HAPTIC_ERROR)
        toast({
          title: "Already on your list",
          description: `${existing.name} is already waiting to be bought.`,
          variant: "destructive",
        })
        return
      } else {
        // Completed duplicate → restore to active list
        const uncompleted = { ...existing, completed: false }
        await updateShoppingItem(uncompleted)
        setItems((prev) => prev.map((i) => (i.id === existing.id ? uncompleted : i)))
        setNewItem({ name: "", quantity: 1, notes: "" })
        setSuggestions([])
        triggerHaptic(HAPTIC_SUCCESS)
        toast({
          title: "Moved back to list",
          description: `${existing.name} was already bought — restored as active.`,
        })
        return
      }
    }

    const itemPayload = {
      name,
      quantity: newItem.quantity || 1,
      notes: newItem.notes || undefined,
      completed: false,
      addedOn: new Date().toISOString(),
      addedFrom: "manual",
    }

    const addedItem = await addToShoppingList(itemPayload as unknown as ShoppingItem)
    setItems((prev) => [...prev, addedItem])
    setNewItem({ name: "", quantity: 1, notes: "" })
    setSuggestions([])
    triggerHaptic(HAPTIC_SUCCESS)
    toast({
      title: "Item Added",
      description: `${name} added to your shopping list.`,
    })
  }

  // Feature 6 — Smart Inventory Auto-Add on completion
  const handleToggleComplete = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const newCompleted = !item.completed

    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: newCompleted } : i)))
    triggerHaptic()

    try {
      await updateShoppingItem({ ...item, completed: newCompleted })

      if (newCompleted) {
        // Create an inventory item with no expiry date
        const inventoryPayload: InventoryItem = {
          id: crypto.randomUUID(),
          name: item.name,
          category: item.category ?? "Other",
          expiryDate: "", // intentionally blank — shows in SET EXPIRY filter
          location: settings?.storageLocations?.[0] ?? "Pantry",
          quantity: item.quantity,
          brand: item.brand,
          orderedFrom: item.orderedFrom,
          archived: false,
          addedOn: new Date().toISOString(),
        }

        let createdInventoryItem: InventoryItem | null = null
        try {
          createdInventoryItem = await addInventoryItem(inventoryPayload)
        } catch {
          // Non-fatal: inventory creation failed, still mark shopping item complete
        }

        toast({
          title: `${item.name} added to inventory`,
          description: "Remember to set the expiry date in your dashboard.",
          action: createdInventoryItem
            ? (
                <ToastAction
                  altText="Undo"
                  onClick={async () => {
                    // Undo: un-complete shopping item + delete inventory item
                    try {
                      await updateShoppingItem({ ...item, completed: false })
                      if (createdInventoryItem) {
                        await deleteInventoryItem(createdInventoryItem.id)
                      }
                      setItems((prev) =>
                        prev.map((i) => (i.id === id ? { ...i, completed: false } : i))
                      )
                    } catch {
                      toast({ title: "Undo failed", variant: "destructive" })
                    }
                  }}
                >
                  Undo
                </ToastAction>
              )
            : undefined,
        })
      }
    } catch {
      // Revert optimistic update on failure
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: !newCompleted } : i)))
      toast({ title: "Failed to update item", variant: "destructive" })
    }
  }

  // Feature 3 — Undo Delete (deferred delete)
  const handleDeleteItem = (item: ShoppingItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    const timer = setTimeout(async () => {
      try {
        await deleteShoppingItem(item.id)
      } catch {
        // Revert if API call fails
        setItems((prev) => [item, ...prev])
        toast({ title: "Failed to delete item", variant: "destructive" })
      }
      pendingDeletes.current.delete(item.id)
    }, 5000)

    pendingDeletes.current.set(item.id, timer)

    toast({
      title: "Item removed",
      description: `${item.name} was removed from your list.`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            clearTimeout(pendingDeletes.current.get(item.id)!)
            pendingDeletes.current.delete(item.id)
            setItems((prev) => [item, ...prev])
          }}
        >
          Undo
        </ToastAction>
      ),
    })
  }

  const handleUpdateItem = async () => {
    if (!editItem) return

    await updateShoppingItem(editItem)
    setItems((prev) => prev.map((i) => (i.id === editItem.id ? editItem : i)))
    setEditItem(null)
    toast({
      title: "Item Updated",
      description: `${editItem.name} has been updated.`,
    })
  }

  // Feature 4 — Search & Sort computation
  const activeItems = items.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)

  const applySearchAndSort = (list: ShoppingItem[]): ShoppingItem[] => {
    let result = list

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) => i.name.toLowerCase().includes(q))
    }

    if (sortBy === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "quantity") {
      result = [...result].sort((a, b) => b.quantity - a.quantity)
    }
    // "recent" is the default order from the API (added_on desc)

    return result
  }

  const displayedItems = applySearchAndSort(showCompleted ? items : activeItems)

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center">
          <ShoppingCart className="mr-2 h-5 w-5" />
          Shopping List
        </h1>
        <Button variant="outline" size="sm" onClick={() => setShowCompleted(!showCompleted)}>
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </Button>
      </div>

      {/* Add Item Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add Item</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-name">Item Name</Label>
              {/* Feature 2 — Typeahead wrapper */}
              <div className="relative">
                <Input
                  id="item-name"
                  value={newItem.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => newItem.name && setShowSuggestions(true)}
                  onBlur={() => {
                    // Small delay so click on suggestion registers first
                    setTimeout(() => setShowSuggestions(false), 150)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddItem()
                    if (e.key === "Escape") setShowSuggestions(false)
                  }}
                  placeholder="Enter item name"
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg overflow-hidden"
                  >
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault() // prevent blur before click
                          handleSelectSuggestion(suggestion)
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <QuantityInput
                id="item-quantity"
                label="Quantity"
                value={newItem.quantity}
                onChange={(value) => setNewItem({ ...newItem, quantity: value })}
                className="w-1/3"
              />

              <div className="space-y-2 flex-1">
                <Label htmlFor="item-notes">Notes (Optional)</Label>
                <Input
                  id="item-notes"
                  value={newItem.notes}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  placeholder="Brand, size, etc."
                />
              </div>
            </div>

            <Button
              className="w-full active:scale-95 transition-transform"
              onClick={handleAddItem}
              disabled={!newItem.name.trim()}
            >
              <Plus className="h-4 w-4 mr-2" /> Add to Shopping List
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature 4 — Sticky search + sort bar */}
      <div className="sticky top-0 z-10 bg-background pb-3 pt-1 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items…"
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="h-4 w-4 mr-1 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recently Added</SelectItem>
              <SelectItem value="name">By Name</SelectItem>
              <SelectItem value="quantity">By Quantity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-24">
        <h2 className="text-lg font-medium mb-3">
          {showCompleted ? "All Items" : "Items to Buy"} ({displayedItems.length})
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                    <div className="h-6 bg-muted rounded w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            {searchQuery
              ? `No items match "${searchQuery}".`
              : showCompleted
              ? "Your shopping list is empty."
              : "No items to buy. Add some items to your shopping list."}
          </div>
        ) : (
          /* Feature 5 — Natural page scroll, no ScrollArea */
          <div className="space-y-3">
            {displayedItems.map((item) => (
              <Card key={item.id} className={item.completed ? "bg-muted/50" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "h-6 w-6 rounded-full shrink-0",
                        item.completed ? "bg-primary text-primary-foreground" : "",
                      )}
                      onClick={() => handleToggleComplete(item.id)}
                    >
                      {item.completed && <Check className="h-3 w-3" />}
                      <span className="sr-only">
                        {item.completed ? "Mark as not completed" : "Mark as completed"}
                      </span>
                    </Button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "font-medium truncate",
                            item.completed ? "line-through text-muted-foreground" : "",
                          )}
                        >
                          {item.brand && (
                            <span className="text-muted-foreground font-normal">{item.brand} </span>
                          )}
                          {item.name}
                          {item.quantity > 1 && (
                            <span className="text-sm font-normal ml-1">×{item.quantity}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {item.category && (
                            <Badge variant="outline" className="text-xs">
                              {item.category}
                            </Badge>
                          )}

                          {showBuyButton && !item.completed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={() => setBuyItem(item)}
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              <span className="sr-only">Buy</span>
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditItem(item)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteItem(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </div>

                      {item.notes && (
                        <div className="text-sm text-muted-foreground mt-1 truncate">
                          {item.notes}
                        </div>
                      )}

                      {item.orderedFrom && !item.completed && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Previously from {item.orderedFrom}
                        </div>
                      )}

                      {item.addedFrom === "consumed" && !item.orderedFrom && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Added automatically when item was consumed
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Show completed count link */}
        {!showCompleted && completedItems.length > 0 && (
          <div className="mt-4 text-center">
            <Button variant="link" onClick={() => setShowCompleted(true)} className="text-sm">
              Show {completedItems.length} completed{" "}
              {completedItems.length === 1 ? "item" : "items"}
            </Button>
          </div>
        )}
      </div>

      <BuyBottomSheet
        item={buyItem}
        open={!!buyItem}
        onOpenChange={(open) => !open && setBuyItem(null)}
        enabledPlatformIds={settings?.deliveryPlatforms || []}
        userOrderSources={settings?.orderSources || []}
      />

      {/* Edit Item Dialog */}
      {editItem && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">Edit Item</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Item Name</Label>
                  <Input
                    id="edit-name"
                    value={editItem.name}
                    onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                  />
                </div>

                <QuantityInput
                  id="edit-quantity"
                  label="Quantity"
                  value={editItem.quantity}
                  onChange={(value) => setEditItem({ ...editItem, quantity: value })}
                  className="space-y-2"
                />

                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes (Optional)</Label>
                  <Textarea
                    id="edit-notes"
                    value={editItem.notes || ""}
                    onChange={(e) => setEditItem({ ...editItem, notes: e.target.value })}
                    placeholder="Add any additional notes"
                    className="resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setEditItem(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateItem}>Save Changes</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
