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
  DialogFooter,
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
import { MainLayout } from "@/components/main-layout"
import {
  getInventoryItems,
  deleteInventoryItem,
  updateInventoryItem,
  markItemAsConsumed,
  markItemAsWasted,
  addToShoppingList,
} from "@/lib/client/api"
import type { InventoryItem, ShoppingItem } from "@/lib/types"
import { EditItemForm } from "@/components/edit-item-form"
import { useToast } from "@/hooks/use-toast"
import Fuse from "fuse.js"
import { MealPlanGenerator } from "@/components/meal-plan-generator"
import { StarRating } from "@/components/star-rating"
import { ReviewPrompt } from "@/components/review-prompt"

export function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<InventoryItem | null>(null)
  const [consumeConfirmItem, setConsumeConfirmItem] = useState<InventoryItem | null>(null)
  const [wasteConfirmItem, setWasteConfirmItem] = useState<InventoryItem | null>(null)
  const [touchStart, setTouchStart] = useState<{ id: string; x: number } | null>(null)
  const [swipedItems, setSwipedItems] = useState<{ [key: string]: string }>({})
  const [sortBy, setSortBy] = useState("expiryDate")
  const [showMealPlanModal, setShowMealPlanModal] = useState(false)
  const [reviewItem, setReviewItem] = useState<{ item: InventoryItem; type: "consumed" | "wasted" } | null>(null)
  const { toast } = useToast()
  const fuseRef = useRef<Fuse<InventoryItem> | null>(null)

  useEffect(() => {
    const load = async () => {
      const inventoryItems = await getInventoryItems()
      setItems(inventoryItems)

      fuseRef.current = new Fuse(inventoryItems, {
      keys: ["name", "category", "location"],
      threshold: 0.4, // Lower threshold means more strict matching
      includeScore: true,
      })
    }

    void load()
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
    if (action === "delete") {
      const item = items.find((item) => item.id === id)
      if (item) {
        setDeleteConfirmItem(item)
      }
    } else if (action === "consumed") {
      // Mark item as consumed
      const item = items.find((item) => item.id === id)
      if (item) {
        setConsumeConfirmItem(item)
      }
    }

    // Reset swiped state
    setSwipedItems((prev) => {
      const newState = { ...prev }
      delete newState[id]
      return newState
    })
  }

  const handleDeleteItem = async () => {
    if (deleteConfirmItem) {
      await deleteInventoryItem(deleteConfirmItem.id)
      setItems(items.filter((item) => item.id !== deleteConfirmItem.id))
      setDeleteConfirmItem(null)
      toast({
        title: "Item Deleted",
        description: `${deleteConfirmItem.name} has been removed from your inventory.`,
      })
    }
  }

  const handleConsumeItem = async () => {
    if (consumeConfirmItem) {
      // Mark as consumed in database
      await markItemAsConsumed(consumeConfirmItem.id)

      // Add to shopping list
      const shoppingItem: ShoppingItem = {
        id: Date.now().toString(),
        name: consumeConfirmItem.name,
        quantity: consumeConfirmItem.quantity || 1,
        category: consumeConfirmItem.category,
        notes: "",
        completed: false,
        addedOn: new Date().toISOString(),
        addedFrom: "consumed",
      }
      await addToShoppingList(shoppingItem)

      // Remove from current items list
      setItems(items.filter((item) => item.id !== consumeConfirmItem.id))

      // Show review prompt if not already rated
      if (!consumeConfirmItem.rating) {
        setReviewItem({ item: consumeConfirmItem, type: "consumed" })
      }

      setConsumeConfirmItem(null)
      toast({
        title: "Item Consumed",
        description: `${consumeConfirmItem.name} has been marked as consumed and added to your shopping list.`,
      })
    }
  }

  const handleWasteItem = async () => {
    if (wasteConfirmItem) {
      // Mark as wasted in database
      await markItemAsWasted(wasteConfirmItem.id)

      // Remove from current items list
      setItems(items.filter((item) => item.id !== wasteConfirmItem.id))

      // Show review prompt if not already rated
      if (!wasteConfirmItem.rating) {
        setReviewItem({ item: wasteConfirmItem, type: "wasted" })
      }

      setWasteConfirmItem(null)
      toast({
        title: "Item Wasted",
        description: `${wasteConfirmItem.name} has been marked as wasted and moved to archive.`,
      })
    }
  }

  const handleReviewSubmit = async (review: { rating: number; reviewTags: string[]; reviewNote: string }) => {
    if (reviewItem) {
      await updateInventoryItem({
        ...reviewItem.item,
        rating: review.rating,
        reviewTags: review.reviewTags,
        reviewNote: review.reviewNote,
        ratedAt: new Date().toISOString(),
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
    await updateInventoryItem(updatedItem)
    setItems(items.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
    setEditItem(null)
    toast({
      title: "Item Updated",
      description: `${updatedItem.name} has been updated.`,
    })
  }

  const getCategories = () => {
    return Array.from(new Set(items.map((item) => item.category)))
  }

  // Check for expired items
  const hasExpiredItems = items.some((item) => new Date(item.expiryDate) < new Date())

  // Check for items with missing expiry dates
  const hasMissingExpiryItems = items.some((item) => !item.expiryDate || isNaN(new Date(item.expiryDate).getTime()))

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Kitchen Inventory</h1>
      </div>

      <div className="mb-6">
        <Button
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          onClick={() => setShowMealPlanModal(true)}
        >
          <div className="relative">
            <ShoppingCart className="h-5 w-5" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300" />
          </div>
          <span>Create Meal Plan</span>
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

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={activeFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter("all")}
            className="min-w-fit"
          >
            All Items
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
      </div>

      <div className="grid grid-cols-1 gap-4 mb-20">
        {filteredItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground mb-4">No items match your search</p>
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
                  className={`${getExpiryColor(item.expiryDate)} border-l-4 relative ${
                    swipedItems[item.id] ? "opacity-50" : ""
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center">
                          <h3 className="font-medium">{item.name}</h3>
                          {item.quantity && item.quantity > 1 && (
                            <span className="ml-2 text-sm text-muted-foreground">x{item.quantity}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.location}</p>
                        {item.rating && item.rating > 0 && (
                          <StarRating value={item.rating} size="sm" readOnly />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.category}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
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
                            <DropdownMenuItem onClick={() => setEditItem(item)}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConsumeConfirmItem(item)}>
                              <Check className="mr-2 h-4 w-4" />
                              <span>Mark as Consumed</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setWasteConfirmItem(item)}>
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Mark as Wasted</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteConfirmItem(item)}>
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
                          onClick={() => setEditItem(item)}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteItem}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Consume Confirmation Dialog */}
      <Dialog open={!!consumeConfirmItem} onOpenChange={(open) => !open && setConsumeConfirmItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as Consumed</DialogTitle>
            <DialogDescription>
              This will mark {consumeConfirmItem?.name} as consumed, add it to your shopping list, and move it to the
              archive.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConsumeConfirmItem(null)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleConsumeItem}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Mark as Consumed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waste Confirmation Dialog */}
      <Dialog open={!!wasteConfirmItem} onOpenChange={(open) => !open && setWasteConfirmItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as Wasted</DialogTitle>
            <DialogDescription>
              This will mark {wasteConfirmItem?.name} as wasted and move it to the archive for waste analytics.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWasteConfirmItem(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleWasteItem}>
              <Trash className="mr-2 h-4 w-4" />
              Mark as Wasted
            </Button>
          </DialogFooter>
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
