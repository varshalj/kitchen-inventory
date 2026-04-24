"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Edit, Plus, Trash2, ShoppingCart, ShoppingBag, Search, X, ArrowUpDown, Mic, Package, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ToastAction } from "@/components/ui/toast"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { MainLayout } from "@/components/main-layout"
import { AnimatedItem } from "@/components/ui/animated-list"
import { LoadingTip } from "@/components/loading-tip"
import { QuantityWithUnits, formatQuantityUnit } from "@/components/quantity-with-units"
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
import { useShoppingCount } from "@/contexts/shopping-count-context"
import { cn, findFuzzyMatch } from "@/lib/utils"
import { VoiceCapture, type VoiceParsedItem } from "@/components/voice-capture"

type SortBy = "recent" | "name" | "quantity"

export function ShoppingList() {
  const { toast } = useToast()
  const { settings } = useUserSettings()
  const { setIncompleteCount } = useShoppingCount()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [editItem, setEditItem] = useState<ShoppingItem | null>(null)
  const [buyItem, setBuyItem] = useState<ShoppingItem | null>(null)
  const [detailItem, setDetailItem] = useState<ShoppingItem | null>(null)
  const [newItem, setNewItem] = useState({ name: "", quantity: 1, unit: "pcs", notes: "" })
  const [isAddingItem, setIsAddingItem] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("recent")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showInstamartSheet, setShowInstamartSheet] = useState(false)
  const [selectedInstamartItems, setSelectedInstamartItems] = useState<Set<string>>(new Set())
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
        setIncompleteCount(shoppingItems.filter((i) => !i.completed).length)
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
        setIsAddingItem(true)
        try {
          const uncompleted = { ...existing, completed: false }
          await updateShoppingItem(uncompleted)
          setItems((prev) => prev.map((i) => (i.id === existing.id ? uncompleted : i)))
          setNewItem({ name: "", quantity: 1, unit: "pcs", notes: "" })
          setSuggestions([])
          triggerHaptic(HAPTIC_SUCCESS)
          toast({
            title: "Moved back to list",
            description: `${existing.name} was already bought — restored as active.`,
          })
        } finally {
          setIsAddingItem(false)
        }
        return
      }
    }

    setIsAddingItem(true)
    try {
      const itemPayload = {
        name,
        quantity: newItem.quantity || 1,
        unit: newItem.unit || "pcs",
        notes: newItem.notes || undefined,
        completed: false,
        addedOn: new Date().toISOString(),
        addedFrom: "manual",
      }

      const addedItem = await addToShoppingList(itemPayload as unknown as ShoppingItem)
      setItems((prev) => {
        const updated = [addedItem, ...prev]
        setIncompleteCount(updated.filter((i) => !i.completed).length)
        return updated
      })
      setNewItem({ name: "", quantity: 1, unit: "pcs", notes: "" })
      setSuggestions([])
      triggerHaptic(HAPTIC_SUCCESS)
      toast({
        title: "Item Added",
        description: `${name} added to your shopping list.`,
      })
    } finally {
      setIsAddingItem(false)
    }
  }

  const handleVoiceConfirm = async (voiceItems: VoiceParsedItem[]) => {
    let addedCount = 0
    const activeNames = items.filter((i) => !i.completed).map((i) => i.name)

    for (const vi of voiceItems) {
      // Safety net: if a fuzzy duplicate slipped through the review screen, skip it
      const existingMatch = findFuzzyMatch(vi.name, activeNames)
      if (existingMatch) continue

      const payload = {
        name: vi.name,
        quantity: vi.quantity || 1,
        unit: vi.unit || "pcs",
        completed: false,
        addedOn: new Date().toISOString(),
        addedFrom: "voice" as const,
      }
      try {
        const addedItem = await addToShoppingList(payload as unknown as ShoppingItem)
        setItems((prev) => {
          const updated = [addedItem, ...prev]
          // Add the new name so subsequent items in the same batch don't duplicate it
          activeNames.push(vi.name)
          setIncompleteCount(updated.filter((i) => !i.completed).length)
          return updated
        })
        addedCount++
      } catch {
        // skip individual failures
      }
    }
    if (addedCount > 0) {
      triggerHaptic(HAPTIC_SUCCESS)
      toast({
        title: `${addedCount} item${addedCount !== 1 ? "s" : ""} added`,
        description: "Voice items added to your shopping list.",
      })
    }
  }

  // Feature 6 — Smart Inventory Auto-Add on completion
  const handleToggleComplete = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const newCompleted = !item.completed

    // Optimistic update
    setItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, completed: newCompleted } : i))
      setIncompleteCount(updated.filter((i) => !i.completed).length)
      return updated
    })
    setTogglingId(id)
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
          const { item: inv } = await addInventoryItem(inventoryPayload)
          createdInventoryItem = inv
          // completedShoppingItems will always be [] here — the shopping item was already
          // marked complete before this call, so no circular auto-complete occurs
        } catch {
          // Non-fatal: inventory creation failed, still mark shopping item complete
        }

        toast({
          title: `${item.name} added to inventory`,
          duration: 5000,
          description: (
            <div>
              <span>Remember to set the expiry date in your dashboard.</span>
              <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full origin-left">
                <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
              </div>
            </div>
          ),
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
    } finally {
      setTogglingId(null)
    }
  }

  // Feature 3 — Undo Delete (deferred delete)
  const handleDeleteItem = (item: ShoppingItem) => {
    // Optimistic remove
    setItems((prev) => {
      const updated = prev.filter((i) => i.id !== item.id)
      setIncompleteCount(updated.filter((i) => !i.completed).length)
      return updated
    })
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
      description: (
        <div>
          <span>{item.name} was removed from your list.</span>
          <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full origin-left">
            <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
          </div>
        </div>
      ),
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            clearTimeout(pendingDeletes.current.get(item.id)!)
            pendingDeletes.current.delete(item.id)
            setItems((prev) => {
              const updated = [item, ...prev]
              setIncompleteCount(updated.filter((i) => !i.completed).length)
              return updated
            })
          }}
        >
          Undo
        </ToastAction>
      ),
    })
  }

  const handleUpdateItem = async () => {
    if (!editItem) return
    setIsSavingEdit(true)
    try {
      await updateShoppingItem(editItem)
      setItems((prev) => prev.map((i) => (i.id === editItem.id ? editItem : i)))
      setEditItem(null)
      toast({
        title: "Item Updated",
        description: `${editItem.name} has been updated.`,
      })
    } catch {
      toast({ title: "Failed to update item", variant: "destructive" })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Feature 4 — Search & Sort computation
  const activeItems = items.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)

  const applySearchAndSort = (list: ShoppingItem[]): ShoppingItem[] => {
    let result = list

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.brand?.toLowerCase().includes(q) ?? false) ||
        (i.notes?.toLowerCase().includes(q) ?? false)
      )
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

  const openInstamartSheet = () => {
    setSelectedInstamartItems(new Set(activeItems.map((i) => i.id)))
    setShowInstamartSheet(true)
  }

  const toggleInstamartItem = (id: string) => {
    setSelectedInstamartItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllInstamartItems = () => {
    if (selectedInstamartItems.size === activeItems.length) {
      setSelectedInstamartItems(new Set())
    } else {
      setSelectedInstamartItems(new Set(activeItems.map((i) => i.id)))
    }
  }

  const handleCopyForInstamart = async () => {
    const selected = activeItems.filter((i) => selectedInstamartItems.has(i.id))
    const text = selected.map((i) => i.name).join(", ")
    await navigator.clipboard.writeText(text)
    setShowInstamartSheet(false)
    window.open("https://www.swiggy.com/instamart", "_blank", "noopener,noreferrer")
    toast({
      title: "List copied!",
      description: "Tap 'Have a shopping list?' in Instamart and paste.",
    })
  }

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
                    {suggestions.map((suggestion) => {
                      const inList = items.some(
                        (i) => !i.completed && i.name.toLowerCase() === suggestion.toLowerCase()
                      )
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between ${inList ? "opacity-60" : ""}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleSelectSuggestion(suggestion)
                          }}
                        >
                          <span>{suggestion}</span>
                          {inList && (
                            <span className="ml-2 text-xs text-amber-600 font-medium shrink-0">In list</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <QuantityWithUnits
              id="item-quantity"
              label="Quantity"
              value={newItem.quantity}
              unit={newItem.unit}
              onChange={(value, unit) => setNewItem({ ...newItem, quantity: value, unit })}
            />

            <div className="space-y-2">
              <Label htmlFor="item-notes">Notes (Optional)</Label>
              <Input
                id="item-notes"
                value={newItem.notes}
                onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                placeholder="Brand, size, etc."
              />
            </div>

            <div className="flex gap-2">
              <LoadingButton
                className="flex-1 active:scale-95 transition-transform"
                onClick={handleAddItem}
                disabled={!newItem.name.trim()}
                isLoading={isAddingItem}
              >
                <Plus className="h-4 w-4 mr-2" /> Add to Shopping List
              </LoadingButton>
              <VoiceCapture
                target="shopping"
                onConfirm={handleVoiceConfirm}
                existingNames={items.filter((i) => !i.completed).map((i) => i.name)}
              />
            </div>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">
            {showCompleted ? "All Items" : "Items to Buy"} ({displayedItems.length})
          </h2>
          {!showCompleted && activeItems.length > 0 && !isLoading && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={openInstamartSheet}
            >
              <Copy className="h-3 w-3" />
              Copy for Instamart
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
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
            <LoadingTip />
            <Card className="animate-pulse">
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
            {displayedItems.map((item, i) => (
              <AnimatedItem key={item.id} index={i}>
              <Card className={item.completed ? "bg-muted/50" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <LoadingButton
                      variant="outline"
                      size="icon"
                      className={cn(
                        "h-6 w-6 rounded-full shrink-0",
                        item.completed ? "bg-primary text-primary-foreground" : "",
                      )}
                      onClick={() => handleToggleComplete(item.id)}
                      isLoading={togglingId === item.id}
                    >
                      {item.completed && <Check className="h-3 w-3" />}
                      <span className="sr-only">
                        {item.completed ? "Mark as not completed" : "Mark as completed"}
                      </span>
                    </LoadingButton>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "font-medium truncate cursor-pointer",
                            item.completed ? "line-through text-muted-foreground" : "",
                          )}
                          onClick={() => setDetailItem(item)}
                        >
                          {item.brand && (
                            <span className="text-muted-foreground font-normal">{item.brand} </span>
                          )}
                          {item.name}
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

                      {(item.quantity > 1 || (item.unit && item.unit !== "pcs")) && (
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {formatQuantityUnit(item.quantity, item.unit)}
                        </div>
                      )}

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
              </AnimatedItem>
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

      {/* Item Detail Sheet */}
      <Sheet open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left">
              {detailItem?.brand && (
                <span className="text-muted-foreground font-normal">{detailItem.brand} </span>
              )}
              {detailItem?.name}
            </SheetTitle>
          </SheetHeader>
          {detailItem && (
            <div className="space-y-3 px-4">
              {/* Row 1: Quantity always left; Category only in right if present */}
              <div className={detailItem.category ? "grid grid-cols-2 gap-3" : ""}>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-medium">
                    {detailItem.unit && detailItem.unit !== "pcs"
                      ? `${detailItem.quantity} ${detailItem.unit}`
                      : detailItem.quantity === 1
                      ? "1 pc"
                      : `${detailItem.quantity} pcs`}
                  </p>
                </div>
                {detailItem.category && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Category</p>
                    <Badge variant="outline" className="text-xs font-normal">
                      {detailItem.category}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Row 2: orderedFrom and addedFrom — 2-col only when both present */}
              {detailItem.orderedFrom && detailItem.addedFrom ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Order from</p>
                    <p className="text-sm font-medium">{detailItem.orderedFrom}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Added by</p>
                    <p className="text-sm font-medium capitalize">
                      {detailItem.addedFrom === "consumed" ? "Auto (consumed)" : detailItem.addedFrom}
                    </p>
                  </div>
                </div>
              ) : detailItem.orderedFrom ? (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Order from</p>
                  <p className="text-sm font-medium">{detailItem.orderedFrom}</p>
                </div>
              ) : detailItem.addedFrom ? (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Added by</p>
                  <p className="text-sm font-medium capitalize">
                    {detailItem.addedFrom === "consumed" ? "Auto (consumed)" : detailItem.addedFrom}
                  </p>
                </div>
              ) : null}

              {detailItem.notes && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{detailItem.notes}</p>
                </div>
              )}

              {showBuyButton && !detailItem.completed && (
                <Button
                  className="w-full mt-2"
                  onClick={() => {
                    setBuyItem(detailItem)
                    setDetailItem(null)
                  }}
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Buy Now
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Copy for Instamart sheet */}
      <Sheet open={showInstamartSheet} onOpenChange={setShowInstamartSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Copy list for Instamart
            </SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mb-3 px-1">
            Select items, copy, then paste into Swiggy&apos;s &ldquo;Have a shopping list?&rdquo; feature.
          </p>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm text-muted-foreground">
              {selectedInstamartItems.size} of {activeItems.length} selected
            </p>
            <button
              onClick={toggleAllInstamartItems}
              className="text-sm font-medium text-primary hover:underline"
            >
              {selectedInstamartItems.size === activeItems.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-1">
            {activeItems.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedInstamartItems.has(item.id)}
                  onChange={() => toggleInstamartItem(item.id)}
                  className="h-5 w-5 rounded border-2 border-muted-foreground accent-primary shrink-0"
                />
                <span className="text-sm">{item.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 mt-4 pb-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowInstamartSheet(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCopyForInstamart}
              disabled={selectedInstamartItems.size === 0}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy {selectedInstamartItems.size > 0 ? `${selectedInstamartItems.size} items` : ""}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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

                <QuantityWithUnits
                  id="edit-quantity"
                  label="Quantity"
                  value={editItem.quantity}
                  unit={editItem.unit ?? "pcs"}
                  onChange={(value, unit) => setEditItem({ ...editItem, quantity: value, unit })}
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
                <LoadingButton onClick={handleUpdateItem} isLoading={isSavingEdit} disabled={isSavingEdit}>Save Changes</LoadingButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
