"use client"

import { useState, useEffect } from "react"
import { Check, Edit, Plus, Trash2, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { MainLayout } from "@/components/main-layout"
import { QuantityInput } from "@/components/quantity-input"
import {
  getShoppingItems,
  updateShoppingItem,
  deleteShoppingItem,
  addToShoppingList,
  type ShoppingItem,
} from "@/lib/data"

export function ShoppingList() {
  const { toast } = useToast()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [editItem, setEditItem] = useState<ShoppingItem | null>(null)
  const [newItem, setNewItem] = useState({ name: "", quantity: 1, notes: "" })
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    // Get shopping list items
    const shoppingItems = getShoppingItems()
    setItems(shoppingItems)
  }, [])

  const handleAddItem = () => {
    if (!newItem.name.trim()) return

    const item: ShoppingItem = {
      id: Date.now().toString(),
      name: newItem.name,
      quantity: newItem.quantity || 1,
      notes: newItem.notes || undefined,
      completed: false,
      addedOn: new Date().toISOString(),
      addedFrom: "manual",
    }

    const addedItem = addToShoppingList(item)

    // Update local state
    const existingIndex = items.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase() && !i.completed)

    if (existingIndex >= 0) {
      // Update quantity if item exists
      setItems(items.map((i, index) => (index === existingIndex ? { ...i, quantity: i.quantity + item.quantity } : i)))
    } else {
      // Add new item
      setItems([...items, addedItem])
    }

    setNewItem({ name: "", quantity: 1, notes: "" })
    toast({
      title: "Item Added",
      description: `${item.name} added to your shopping list.`,
    })
  }

  const handleToggleComplete = (id: string) => {
    const item = items.find((item) => item.id === id)
    if (item) {
      const updatedItem = { ...item, completed: !item.completed }
      updateShoppingItem(updatedItem)
      setItems(items.map((item) => (item.id === id ? updatedItem : item)))
    }
  }

  const handleDeleteItem = (id: string) => {
    deleteShoppingItem(id)
    setItems(items.filter((item) => item.id !== id))
    toast({
      title: "Item Removed",
      description: "Item removed from your shopping list.",
    })
  }

  const handleUpdateItem = () => {
    if (!editItem) return

    updateShoppingItem(editItem)
    setItems(items.map((item) => (item.id === editItem.id ? editItem : item)))
    setEditItem(null)
    toast({
      title: "Item Updated",
      description: `${editItem.name} has been updated.`,
    })
  }

  // Filter items based on completion status
  const activeItems = items.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)
  const displayedItems = showCompleted ? items : activeItems

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

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add Item</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-name">Item Name</Label>
              <Input
                id="item-name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Enter item name"
              />
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

            <Button className="w-full" onClick={handleAddItem} disabled={!newItem.name.trim()}>
              <Plus className="h-4 w-4 mr-2" /> Add to Shopping List
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-24">
        <h2 className="text-lg font-medium mb-3">
          {showCompleted ? "All Items" : "Items to Buy"} ({displayedItems.length})
        </h2>

        {displayedItems.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            {showCompleted ? "Your shopping list is empty." : "No items to buy. Add some items to your shopping list."}
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-330px)]">
            <div className="space-y-3 pr-3">
              {displayedItems.map((item) => (
                <Card key={item.id} className={item.completed ? "bg-muted/50" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className={cn(
                          "h-6 w-6 rounded-full",
                          item.completed ? "bg-primary text-primary-foreground" : "",
                        )}
                        onClick={() => handleToggleComplete(item.id)}
                      >
                        {item.completed && <Check className="h-3 w-3" />}
                        <span className="sr-only">
                          {item.completed ? "Mark as not completed" : "Mark as completed"}
                        </span>
                      </Button>

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div
                            className={cn("font-medium", item.completed ? "line-through text-muted-foreground" : "")}
                          >
                            {item.name}
                            {item.quantity > 1 && <span className="text-sm font-normal ml-1">×{item.quantity}</span>}
                          </div>

                          <div className="flex items-center gap-1">
                            {item.category && (
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                            )}

                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(item)}>
                              <Edit className="h-3.5 w-3.5" />
                              <span className="sr-only">Edit</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </div>

                        {item.notes && <div className="text-sm text-muted-foreground mt-1">{item.notes}</div>}

                        {item.addedFrom === "consumed" && (
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
          </ScrollArea>
        )}

        {/* Show completed items count if not showing completed items */}
        {!showCompleted && completedItems.length > 0 && (
          <div className="mt-4 text-center">
            <Button variant="link" onClick={() => setShowCompleted(true)} className="text-sm">
              Show {completedItems.length} completed {completedItems.length === 1 ? "item" : "items"}
            </Button>
          </div>
        )}
      </div>

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

// Helper function to conditionally join classes
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ")
}
