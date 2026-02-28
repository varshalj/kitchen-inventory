"use client"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { addInventoryItem } from "@/lib/client/api"
import type { InventoryItem } from "@/lib/types"

interface QuickAddSectionProps {
  onAddItem: (item: InventoryItem) => void
  onClose: () => void
}

export function QuickAddSection({ onAddItem, onClose }: QuickAddSectionProps) {
  // Predefined quick add items
  const quickAddItems = [
    {
      name: "Milk",
      category: "Dairy",
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Refrigerator",
      quantity: 1,
    },
    {
      name: "Bread",
      category: "Grains",
      expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Pantry",
      quantity: 1,
    },
    {
      name: "Eggs",
      category: "Dairy",
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Refrigerator",
      quantity: 12,
    },
    {
      name: "Bananas",
      category: "Fruits",
      expiryDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Counter",
      quantity: 5,
    },
    {
      name: "Chicken Breast",
      category: "Meat",
      expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Freezer",
      quantity: 2,
    },
    {
      name: "Spinach",
      category: "Vegetables",
      expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Refrigerator",
      quantity: 1,
    },
  ]

  const handleQuickAdd = async (item: any) => {
    const newItem: InventoryItem = {
      id: Date.now().toString(),
      ...item,
    }

    await addInventoryItem(newItem)
    onAddItem(newItem)
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Quick Add</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ScrollArea className="w-full">
          <div className="grid grid-cols-2 gap-2">
            {quickAddItems.map((item, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto py-2 justify-start flex-col items-start"
                onClick={() => handleQuickAdd(item)}
              >
                <div className="font-medium text-left">{item.name}</div>
                <div className="flex items-center mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {item.category}
                  </Badge>
                </div>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
