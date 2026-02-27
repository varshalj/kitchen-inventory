"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { InventoryItem } from "@/lib/data"
import { useUserSettings } from "@/hooks/use-user-settings"
import { QuantityInput } from "@/components/quantity-input"
import { CurrencyInput } from "@/components/currency-input"
import { StarRating } from "@/components/star-rating"
import { cn } from "@/lib/utils"

interface EditItemFormProps {
  item: InventoryItem
  onSave: (item: InventoryItem) => void
  onCancel: () => void
}

export function EditItemForm({ item, onSave, onCancel }: EditItemFormProps) {
  const { settings } = useUserSettings()
  const [formData, setFormData] = useState({
    ...item,
    price: item.price || "",
    brand: item.brand || "",
    notes: item.notes || "",
    orderedFrom: item.orderedFrom || "",
    rating: item.rating || 0,
    reviewTags: item.reviewTags || [],
    reviewNote: item.reviewNote || "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement

    if (type === "number") {
      setFormData((prev) => ({ ...prev, [name]: Number.parseInt(value) || 0 }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1">
      <form onSubmit={handleSubmit} className="space-y-4 pb-16 relative">
        <div className="space-y-2">
          <Label htmlFor="edit-name">Item Name</Label>
          <Input
            id="edit-name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            autoFocus={false}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => handleSelectChange("category", value)} required>
            <SelectTrigger id="edit-category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Fruits">Fruits</SelectItem>
              <SelectItem value="Vegetables">Vegetables</SelectItem>
              <SelectItem value="Dairy">Dairy</SelectItem>
              <SelectItem value="Meat">Meat</SelectItem>
              <SelectItem value="Grains">Grains</SelectItem>
              <SelectItem value="Canned">Canned</SelectItem>
              <SelectItem value="Frozen">Frozen</SelectItem>
              <SelectItem value="Snacks">Snacks</SelectItem>
              <SelectItem value="Beverages">Beverages</SelectItem>
              <SelectItem value="Condiments">Condiments</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <QuantityInput
            id="edit-quantity"
            label="Quantity"
            value={formData.quantity || 1}
            onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
          />

          <CurrencyInput
            id="edit-price"
            label="Price"
            value={formData.price?.replace(/[^\d.]/g, "") || ""}
            currency={settings?.currency || "INR"}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, price: val }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-expiryDate">Expiry Date</Label>
          <Input
            id="edit-expiryDate"
            name="expiryDate"
            type="date"
            value={formData.expiryDate.split("T")[0]}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-location">Storage Location</Label>
          <Select value={formData.location} onValueChange={(value) => handleSelectChange("location", value)} required>
            <SelectTrigger id="edit-location">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {(settings?.storageLocations || []).map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-brand">Brand (Optional)</Label>
            <Input
              id="edit-brand"
              name="brand"
              value={formData.brand}
              onChange={handleInputChange}
              placeholder="Brand name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-orderedFrom">Ordered From (Optional)</Label>
            <Select
              value={formData.orderedFrom || "none"}
              onValueChange={(value) => handleSelectChange("orderedFrom", value === "none" ? "" : value)}
            >
              <SelectTrigger id="edit-orderedFrom">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(settings?.orderSources || []).map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-notes">Notes (Optional)</Label>
          <Textarea
            id="edit-notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            placeholder="Add any additional notes about this item"
            className="resize-none"
          />
        </div>

        {/* Product Rating */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">My Rating</Label>
            {formData.rating > 0 && formData.ratedAt && (
              <span className="text-xs text-muted-foreground">
                Rated {new Date(formData.ratedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <StarRating
            value={formData.rating || 0}
            onChange={(val) => setFormData((prev) => ({
              ...prev,
              rating: val,
              ratedAt: val > 0 ? new Date().toISOString() : undefined,
            }))}
            size="md"
          />
          {formData.rating > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {["Great taste", "Poor quality", "Good value", "Too expensive", "Would reorder", "Wouldn't reorder", "Fresh", "Stale/bad"].map((tag) => {
                  const isSelected = (formData.reviewTags || []).includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const tags = formData.reviewTags || []
                        setFormData((prev) => ({
                          ...prev,
                          reviewTags: isSelected ? tags.filter((t) => t !== tag) : [...tags, tag],
                        }))
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        isSelected
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
              <Textarea
                placeholder="Quick note about this product..."
                value={formData.reviewNote || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, reviewNote: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </>
          )}
        </div>

        {formData.addedOn && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Added On</Label>
            <p className="text-sm">{new Date(formData.addedOn).toLocaleDateString()}</p>
          </div>
        )}

        {formData.consumedOn && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Consumed On</Label>
            <p className="text-sm">{new Date(formData.consumedOn).toLocaleDateString()}</p>
          </div>
        )}

        <div className="sticky bottom-0 pt-4 pb-2 bg-background border-t flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </div>
  )
}
