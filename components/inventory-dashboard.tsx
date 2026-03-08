"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Search, Filter, Check, Trash2, Edit, AlertCircle, ShoppingCart, Trash, Sparkles, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { ToastAction } from "@/components/ui/toast"
import { MainLayout } from "@/components/main-layout"
import { EditItemForm } from "@/components/edit-item-form"
import { useToast } from "@/hooks/use-toast"
import Fuse from "fuse.js"
import { MealPlanGenerator } from "@/components/meal-plan-generator"
import { StarRating } from "@/components/star-rating"
import { ReviewPrompt } from "@/components/review-prompt"
import { fetchWithAuth } from "@/lib/api-client"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import { ItemDetailSheet } from "@/components/item-detail-sheet"
import { BugReportDialog } from "@/components/bug-report-dialog"
import { useBugReportNudge } from "@/hooks/use-bug-report-nudge"
import type { InventoryItem } from "@/lib/types"

export function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [touchStart, setTouchStart] = useState<{ id: string; x: number } | null>(null)
  const [swipedItems, setSwipedItems] = useState<{ [key: string]: string }>({})
  const [sortBy, setSortBy] = useState("expiryDate")
  const [showMealPlanModal, setShowMealPlanModal] = useState(false)
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)
  const [reviewItem, setReviewItem] = useState<{ item: InventoryItem; type: "consumed" | "wasted" } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { toast } = useToast()
  const { toastWithNudge, bugReportOpen, setBugReportOpen } = useBugReportNudge()
  const fuseRef = useRef<Fuse<InventoryItem> | null>(null)
  const pendingActions = useRef<Map<string, {
    type: "delete" | "consume" | "waste"
    item: InventoryItem
    shoppingItemId?: string
    timer?: ReturnType<typeof setTimeout>
    cleanupTimer?: ReturnType<typeof setTimeout>
  }>>(new Map())

useEffect(() => {
  const load = async () => {
    try {
      const response = await fetchWithAuth("/api/inventory?archived=false")
      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `Failed to load inventory (${response.status})`)
      }

      const inventoryItems = await response.json()
      const safeItems = Array.isArray(inventoryItems) ? inventoryItems : []

      setItems(safeItems)

      fuseRef.current = new Fuse(safeItems, {
        keys: ["name", "category", "location"],
        threshold: 0.4,
        includeScore: true,
      })
    } catch (error) {
      console.error("Failed to load inventory:", error)
      setItems([])
      fuseRef.current = new Fuse([], {
        keys: ["name", "category", "location"],
        threshold: 0.4,
        includeScore: true,
      })
    } finally {
      setIsLoading(false)
    }
  }

  load()
}, [])

  useEffect(() => {
    filterAndSortItems(activeFilter, searchQuery, sortBy)
  }, [items, activeFilter, searchQuery, sortBy])

  const filterAndSortItems = (filter: string, query: string, sort: string) => {
    let result = [...items]

    // Apply search query if provided
    if (query && fuseRef.current) {
      const searchResults = fuseRef.current.search(query)
      result = searchResults.map((res) => res.item)
    }

    // Get current date for expiry comparison
    const currentDate = new Date()

    // Apply category filter
    if (filter === "expired") {
      result = result.filter((item) => {
        return new Date(item.expiryDate) < currentDate
      })
    } else if (filter === "expiring-soon") {
      result = result.filter((item) => {
        const expiryDate = new Date(item.expiryDate)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24))
        return daysUntilExpiry <= 7 && daysUntilExpiry >= 0
      })
    } else if (filter === "missing-expiry") {
      // Filter for items with missing or invalid expiry dates
      result = result.filter((item) => {
        return !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())
      })
    } else if (filter !== "all") {
      result = result.filter((item) => item.category === filter)
    }

    // Apply sorting
    if (sort === "expiryDate") {
      result.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === "category") {
      result.sort((a, b) => a.category.localeCompare(b.category))
    } else if (sort === "location") {
      result.sort((a, b) => a.location.localeCompare(b.location))
    }

    setFilteredItems(result)
  }

  // Function to determine card border color based on expiry date
  const getExpiryColor = (expiryDate: string) => {
    // Check if expiry date is missing or invalid
    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      return "border-yellow-500 bg-yellow-50"
    }

    const currentDate = new Date()
    const expDate = new Date(expiryDate)

    // If already expired
    if (expDate < currentDate) {
      return "border-red-500 bg-red-50"
    }

    const daysUntilExpiry = Math.ceil((expDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24))

    if (daysUntilExpiry <= 3) return "border-amber-500"
    if (daysUntilExpiry <= 7) return "border-yellow-500"
    return "border-green-500"
  }

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setTouchStart({
      id,
      x: e.touches[0].clientX,
    })
  }

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (!touchStart) return

    if (touchStart.id !== id) return

    const touchEnd = e.touches[0].clientX
    const diff = touchStart.x - touchEnd

    // Determine swipe direction
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left - Delete
        setSwipedItems((prev) => ({ ...prev, [id]: "delete" }))
      } else {
        // Swipe right - Mark as consumed
        setSwipedItems((prev) => ({ ...prev, [id]: "consumed" }))
      }
    } else {
      // Reset if swipe not far enough
      setSwipedItems((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })
    }
  }

  const handleTouchEnd = (id: string) => {
    setTouchStart(null)
  }

  const confirmSwipeAction = (id: string, action: string) => {
    const item = items.find((i) => i.id === id)

    if (action === "delete" && item) {
      handleDeleteItem(item)
    } else if (action === "consumed" && item) {
      void handleConsumeItem(item)
    }

    // Reset swiped state
    setSwipedItems((prev) => {
      const newState = { ...prev }
      delete newState[id]
      return newState
    })
  }

  const progressBar = (
    <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full">
      <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
    </div>
  )

  const handleDeleteItem = (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    const timer = setTimeout(async () => {
      try {
        await fetchWithAuth(`/api/inventory/${item.id}`, { method: "DELETE" })
      } catch {
        setItems((prev) => [item, ...prev])
        toastWithNudge({ title: "Delete Failed", description: "Could not delete item.", variant: "destructive" })
      }
      pendingActions.current.delete(item.id)
    }, 5000)

    pendingActions.current.set(item.id, { type: "delete", item, timer })

    toast({
      title: "Item deleted",
      description: (
        <div>
          <span>{item.name} will be removed.</span>
          {progressBar}
        </div>
      ),
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const pending = pendingActions.current.get(item.id)
            if (!pending) return
            clearTimeout(pending.timer)
            pendingActions.current.delete(item.id)
            setItems((prev) => [item, ...prev])
          }}
        >
          Undo
        </ToastAction>
      ),
    })
  }

  const handleConsumeItem = async (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    try {
      const response = await fetchWithAuth("/api/inventory/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action: "consume", addToShoppingList: true }),
      })

      const payload = await response.json()
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "Consume operation failed")
      }

      const shoppingItemId: string | undefined = payload.shoppingItemId

      const cleanupTimer = setTimeout(() => pendingActions.current.delete(item.id), 5500)
      pendingActions.current.set(item.id, { type: "consume", item, shoppingItemId, cleanupTimer })

      if (!item.rating) {
        setReviewItem({ item, type: "consumed" })
      }

      toast({
        title: "Item consumed",
        description: (
          <div>
            <span>{item.name} moved to archive &amp; added to shopping list.</span>
            {progressBar}
          </div>
        ),
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              const pending = pendingActions.current.get(item.id)
              if (!pending) return
              clearTimeout(pending.cleanupTimer)
              pendingActions.current.delete(item.id)
              try {
                await fetchWithAuth(`/api/inventory/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    archived: false,
                    archiveReason: null,
                    consumedOn: null,
                    quantity: item.quantity,
                  }),
                })
                if (pending.shoppingItemId) {
                  await fetchWithAuth(`/api/shopping/${pending.shoppingItemId}`, { method: "DELETE" })
                }
                setItems((prev) => [item, ...prev])
                setReviewItem(null)
              } catch {
                toastWithNudge({ title: "Undo Failed", description: "Could not restore item.", variant: "destructive" })
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    } catch (error) {
      setItems((prev) => [item, ...prev])
      const message = error instanceof Error ? error.message : "Consume operation failed"
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Consume Failed", description: message, variant: "destructive" })
    }
  }

  const handleWasteItem = async (item: InventoryItem) => {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    triggerHaptic(HAPTIC_SUCCESS)

    try {
      const response = await fetchWithAuth("/api/inventory/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action: "waste", addToShoppingList: false }),
      })

      const payload = await response.json()
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "Waste operation failed")
      }

      const cleanupTimer = setTimeout(() => pendingActions.current.delete(item.id), 5500)
      pendingActions.current.set(item.id, { type: "waste", item, cleanupTimer })

      if (!item.rating) {
        setReviewItem({ item, type: "wasted" })
      }

      toast({
        title: "Item marked as wasted",
        description: (
          <div>
            <span>{item.name} moved to archive.</span>
            {progressBar}
          </div>
        ),
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              const pending = pendingActions.current.get(item.id)
              if (!pending) return
              clearTimeout(pending.cleanupTimer)
              pendingActions.current.delete(item.id)
              try {
                await fetchWithAuth(`/api/inventory/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    archived: false,
                    archiveReason: null,
                    wastedOn: null,
                    quantity: item.quantity,
                  }),
                })
                setItems((prev) => [item, ...prev])
                setReviewItem(null)
              } catch {
                toastWithNudge({ title: "Undo Failed", description: "Could not restore item.", variant: "destructive" })
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    } catch (error) {
      setItems((prev) => [item, ...prev])
      const message = error instanceof Error ? error.message : "Waste operation failed"
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Waste Failed", description: message, variant: "destructive" })
    }
  }

  const handleReviewSubmit = async (review: { rating: number; reviewTags: string[]; reviewNote: string }) => {
    if (reviewItem) {
      await fetchWithAuth(`/api/inventory/${reviewItem.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: review.rating,
          reviewTags: review.reviewTags,
          reviewNote: review.reviewNote,
          ratedAt: new Date().toISOString(),
        }),
      })
      setReviewItem(null)
      toast({
        title: "Review Saved",
        description: "Your rating will help personalize future recommendations.",
      })
    }
  }

  const handleReviewSkip = () => {
    setReviewItem(null)
  }

  const handleEditSave = async (updatedItem: InventoryItem) => {
    try {
      const response = await fetchWithAuth(`/api/inventory/${updatedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedItem),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || "Failed to update inventory item")
      }

      const savedItem = (await response.json()) as InventoryItem

      setItems(items.map((item) => (item.id === savedItem.id ? savedItem : item)))
      setEditItem(null)
      toast({
        title: "Item Updated",
        description: `${savedItem.name} has been updated.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update inventory item"
      toastWithNudge({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      })
    }
  }

  const getCategories = () => {
    return Array.from(new Set(items.map((item) => item.category)))
  }

  // Count badges for filter pills
  const now = new Date()
  const expiredCount = items.filter((i) => i.expiryDate && new Date(i.expiryDate) < now).length
  const expiringSoonCount = items.filter((i) => {
    if (!i.expiryDate || isNaN(new Date(i.expiryDate).getTime())) return false
    const days = Math.ceil((new Date(i.expiryDate).getTime() - now.getTime()) / 86400000)
    return days >= 0 && days <= 7
  }).length
  const missingExpiryCount = items.filter((i) => !i.expiryDate || isNaN(new Date(i.expiryDate).getTime())).length

  // Check for expired items
  const hasExpiredItems = expiredCount > 0

  // Check for items with missing expiry dates
  const hasMissingExpiryItems = missingExpiryCount > 0

  // Bulk selection helpers
  const toggleItemSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkConsume = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth("/api/inventory/operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, action: "consume", addToShoppingList: false }),
          })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Consumed", description: `${targets.length} item${targets.length !== 1 ? "s" : ""} marked as consumed.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Consume Failed", description: "Some items could not be updated.", variant: "destructive" })
    }
  }

  const handleBulkWaste = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth("/api/inventory/operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, action: "waste" }),
          })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Wasted", description: `${targets.length} item${targets.length !== 1 ? "s" : ""} marked as wasted.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Waste Failed", description: "Some items could not be updated.", variant: "destructive" })
    }
  }

  const handleBulkDelete = async () => {
    const targets = filteredItems.filter((i) => selectedIds.has(i.id))
    if (!targets.length) return
    try {
      await Promise.all(
        targets.map((item) =>
          fetchWithAuth(`/api/inventory/${item.id}`, { method: "DELETE" })
        )
      )
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
      exitSelectionMode()
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Items Deleted", description: `${targets.length} item${targets.length !== 1 ? "s" : ""} removed.` })
    } catch {
      triggerHaptic(HAPTIC_ERROR)
      toastWithNudge({ title: "Bulk Delete Failed", description: "Some items could not be deleted.", variant: "destructive" })
    }
  }

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Kitchen Inventory</h1>
      </div>

      <div className="mb-6">
        <Button
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50"
          onClick={() => setShowMealPlanModal(true)}
          disabled={isLoading || items.length === 0}
        >
          <div className="relative">
            <ShoppingCart className="h-5 w-5" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300" />
          </div>
          <span>{items.length === 0 && !isLoading ? "Add items to create a meal plan" : "Create Meal Plan"}</span>
        </Button>
      </div>

      <div className="sticky top-0 z-10 bg-background pt-2 pb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search items"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
                <span className="sr-only">Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={activeFilter} onValueChange={setActiveFilter}>
                <DropdownMenuRadioItem value="all">All Items</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="expired">
                  <span className="flex items-center">
                    <AlertCircle className="mr-1 h-3.5 w-3.5 text-red-500" />
                    Expired Items
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="expiring-soon">
                  <span className="flex items-center">
                    <AlertCircle className="mr-1 h-3.5 w-3.5 text-amber-500" />
                    Expiring Soon
                  </span>
                </DropdownMenuRadioItem>
                {hasMissingExpiryItems && (
                  <DropdownMenuRadioItem value="missing-expiry">
                    <span className="flex items-center">
                      <Clock className="mr-1 h-3.5 w-3.5 text-yellow-500" />
                      Missing Expiry Date
                    </span>
                  </DropdownMenuRadioItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Categories</DropdownMenuLabel>
                {getCategories().map((category) => (
                  <DropdownMenuRadioItem key={category} value={category}>
                    {category}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
                <DropdownMenuRadioItem value="expiryDate">Expiry Date</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="category">Category</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="location">Location</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
            <Button
              variant={activeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("all")}
              className="min-w-fit"
            >
              All Items
              {items.length > 0 && (
                <span className="ml-1.5 text-xs font-normal opacity-70">{items.length}</span>
              )}
            </Button>

            {hasExpiredItems && (
              <Button
                variant={activeFilter === "expired" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter("expired")}
                className="min-w-fit text-red-500 border-red-200"
              >
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                Expired
                <span className="ml-1.5 text-xs font-normal opacity-70">{expiredCount}</span>
              </Button>
            )}

            <Button
              variant={activeFilter === "expiring-soon" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("expiring-soon")}
              className="min-w-fit text-amber-500 border-amber-200"
            >
              <AlertCircle className="mr-1 h-3.5 w-3.5" />
              Expiring Soon
              {expiringSoonCount > 0 && (
                <span className="ml-1.5 text-xs font-normal opacity-70">{expiringSoonCount}</span>
              )}
            </Button>

            {hasMissingExpiryItems && (
              <Button
                variant={activeFilter === "missing-expiry" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter("missing-expiry")}
                className="min-w-fit text-yellow-500 border-yellow-200"
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                Set Expiry
                <span className="ml-1.5 text-xs font-normal opacity-70">{missingExpiryCount}</span>
              </Button>
            )}

            {getCategories().map((category) => (
              <Button
                key={category}
                variant={activeFilter === category ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(category)}
                className="min-w-fit"
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Select Items / Cancel Selection — hidden when list is empty */}
          {filteredItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            >
              {selectionMode ? "Cancel" : "Select"}
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar — only visible in selection mode */}
      {selectionMode && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg mb-4">
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
            onChange={toggleSelectAll}
          />
          <span className="text-sm flex-1 text-muted-foreground">
            {selectedIds.size} of {filteredItems.length} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={selectedIds.size === 0}
            onClick={handleBulkConsume}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Consume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={selectedIds.size === 0}
            onClick={handleBulkWaste}
          >
            <Trash className="h-3.5 w-3.5 mr-1" />
            Waste
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-destructive hover:text-destructive"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-20">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border p-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                  <div className="h-6 bg-muted rounded w-16" />
                </div>
                <div className="mt-3 pt-3 border-t">
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground mb-4">
              {items.length === 0 ? "Your inventory is empty" : "No items match your search"}
            </p>
            <Button asChild>
              <Link href="/add-item">Add New Item</Link>
            </Button>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpired = new Date(item.expiryDate) < new Date()
            const isMissingExpiry = !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())

            return (
              <div
                key={item.id}
                className="relative overflow-hidden"
                onTouchStart={(e) => handleTouchStart(e, item.id)}
                onTouchMove={(e) => handleTouchMove(e, item.id)}
                onTouchEnd={() => handleTouchEnd(item.id)}
              >
                {/* Swipe action buttons */}
                {swipedItems[item.id] && (
                  <div className="absolute inset-y-0 right-0 left-0 flex items-center justify-between z-10">
                    {swipedItems[item.id] === "consumed" && (
                      <div
                        className="h-full flex items-center justify-center bg-green-500 text-white px-4"
                        onClick={() => confirmSwipeAction(item.id, "consumed")}
                      >
                        <Check className="h-5 w-5 mr-2" />
                        <span>Mark as Consumed</span>
                      </div>
                    )}
                    {swipedItems[item.id] === "delete" && (
                      <div
                        className="h-full flex items-center justify-center bg-red-500 text-white px-4 ml-auto"
                        onClick={() => confirmSwipeAction(item.id, "delete")}
                      >
                        <Trash2 className="h-5 w-5 mr-2" />
                        <span>Delete</span>
                      </div>
                    )}
                  </div>
                )}

                <Card
                  className={`${getExpiryColor(item.expiryDate)} border-l-4 relative cursor-pointer transition-all ${
                    swipedItems[item.id] ? "opacity-50" : ""
                  } ${selectionMode && selectedIds.has(item.id) ? "ring-2 ring-primary" : ""}`}
                  onClick={() => selectionMode ? toggleItemSelection(item.id) : setDetailItem(item)}
                >
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {selectionMode && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded mt-0.5 shrink-0"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center">
                            <h3 className="font-medium">{item.name}</h3>
                            {item.quantity && item.quantity >= 1 && (
                              <span className="ml-2 text-sm text-muted-foreground">
                                {item.unit && item.unit !== "pcs"
                                  ? `${item.quantity}${item.unit}`
                                  : item.quantity > 1 ? `×${item.quantity}` : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.location}</p>
                          {item.rating && item.rating > 0 && (
                            <StarRating value={item.rating} size="sm" readOnly />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{item.category}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                              <span className="sr-only">Open menu</span>
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 15 15"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                              >
                                <path
                                  d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                                  fill="currentColor"
                                  fillRule="evenodd"
                                  clipRule="evenodd"
                                ></path>
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditItem(item) }}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleConsumeItem(item) }}>
                              <Check className="mr-2 h-4 w-4" />
                              <span>Mark as Consumed</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleWasteItem(item) }}>
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Mark as Wasted</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteItem(item) }}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {isExpired && (
                      <div className="mt-2 text-red-500 text-sm flex items-center">
                        <AlertCircle className="h-3.5 w-3.5 mr-1" />
                        Expired on {new Date(item.expiryDate).toLocaleDateString()}
                      </div>
                    )}
                    {isMissingExpiry && (
                      <div className="mt-2 text-yellow-500 text-sm flex items-center">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        <span>Set expiry date</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 ml-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); setEditItem(item) }}
                        >
                          Set Now
                        </Button>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="border-t pt-3 text-xs text-muted-foreground">
                    {!isExpired && !isMissingExpiry && (
                      <span>Expires: {new Date(item.expiryDate).toLocaleDateString()}</span>
                    )}
                  </CardFooter>
                </Card>
              </div>
            )
          })
        )}
      </div>

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>Update the details of your inventory item.</DialogDescription>
          </DialogHeader>

          {editItem && <EditItemForm item={editItem} onSave={handleEditSave} onCancel={() => setEditItem(null)} />}
        </DialogContent>
      </Dialog>

      {/* Review Prompt Dialog */}
      <Dialog open={!!reviewItem} onOpenChange={(open) => !open && setReviewItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rate This Product</DialogTitle>
            <DialogDescription>
              Help yourself remember what to reorder next time.
            </DialogDescription>
          </DialogHeader>
          {reviewItem && (
            <ReviewPrompt
              item={reviewItem.item}
              type={reviewItem.type}
              onSubmit={handleReviewSubmit}
              onSkip={handleReviewSkip}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Item Detail Sheet */}
      <ItemDetailSheet
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        onEdit={(item) => setEditItem(item)}
        onDelete={(item) => { setDetailItem(null); handleDeleteItem(item) }}
      />

      {/* Bug Report Dialog (opened contextually after errors) */}
      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />

      {/* Meal Plan Generator Modal */}
      <Dialog open={showMealPlanModal} onOpenChange={setShowMealPlanModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="mr-2 h-5 w-5" />
              <Sparkles className="mr-2 h-4 w-4 text-yellow-400" />
              AI Meal Plan Generator
            </DialogTitle>
            <DialogDescription>Create a personalized meal plan based on your inventory items</DialogDescription>
          </DialogHeader>

          <MealPlanGenerator items={items} onClose={() => setShowMealPlanModal(false)} />
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
