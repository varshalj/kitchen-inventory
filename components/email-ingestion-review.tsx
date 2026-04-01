"use client"

import { useState, useCallback } from "react"
import { X, Package, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { QuantityWithUnits } from "@/components/quantity-with-units"
import { CurrencyInput } from "@/components/currency-input"
import { useUserSettings } from "@/hooks/use-user-settings"
import { useToast } from "@/hooks/use-toast"
import { fetchWithAuth } from "@/lib/api-client"
import { CATEGORIES, defaultExpiryDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import type { EmailIngestionRow } from "@/lib/server/repositories/email-ingestion-repo"

function formatPrice(price: string | undefined): string {
  const n = parseFloat(price ?? "")
  return isNaN(n) ? (price ?? "") : n.toFixed(2)
}

interface ReviewItem {
  included: boolean
  name: string
  brand: string
  category: string
  quantity: number
  unit: string
  price: string
  expiryDate: string
  location: string
}

interface EmailIngestionReviewProps {
  ingestion: EmailIngestionRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EmailIngestionReview({
  ingestion,
  open,
  onOpenChange,
  onSaved,
}: EmailIngestionReviewProps) {
  const { settings, updateSettings } = useUserSettings()
  const { toast } = useToast()
  const storageLocations = settings?.storageLocations ?? ["Refrigerator", "Freezer", "Pantry", "Cabinet", "Counter", "Other"]

  const [items, setItems] = useState<ReviewItem[]>(() =>
    (ingestion.parsed_items ?? []).map((p: any) => ({
      included: true,
      name: p.name ?? "",
      brand: p.brand ?? "",
      category: p.category ?? "Other",
      quantity: p.quantity ?? 1,
      unit: p.unit ?? "pcs",
      price: p.price ?? "",
      expiryDate: p.expiryDate ?? defaultExpiryDate(p.category),
      location: storageLocations[0] ?? "Pantry",
    })),
  )

  const [saving, setSaving] = useState(false)

  const includedCount = items.filter((i) => i.included).length

  const toggleItem = useCallback((index: number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, included: !item.included } : item)))
  }, [])

  const updateItem = useCallback((index: number, field: keyof ReviewItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value }
        if (field === "category") {
          updated.expiryDate = defaultExpiryDate(value as string)
        }
        return updated
      }),
    )
  }, [])

  const handleSave = async () => {
    const toSave = items.filter((i) => i.included)
    if (toSave.length === 0) return

    setSaving(true)
    try {
      const payload = toSave.map((item) => ({
        name: item.name,
        brand: item.brand || undefined,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price || undefined,
        expiryDate: item.expiryDate,
        location: item.location,
        syncedFromEmail: true,
        emailSource: ingestion.platform ?? undefined,
        orderedFrom: ingestion.platform ?? undefined,
      }))

      const res = await fetchWithAuth("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error("Failed to save items")

      // Mark ingestion as saved
      await fetchWithAuth(`/api/email-ingestion/${ingestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "saved" }),
      })

      // Auto-add platform to order sources if new
      if (ingestion.platform && settings) {
        const currentSources = settings.orderSources ?? []
        if (!currentSources.some((s) => s.toLowerCase() === ingestion.platform!.toLowerCase())) {
          updateSettings({ orderSources: [...currentSources, ingestion.platform] })
        }
      }

      triggerHaptic(HAPTIC_SUCCESS)
      toast({
        title: `${toSave.length} item${toSave.length !== 1 ? "s" : ""} added to inventory`,
        description: ingestion.platform ? `From your ${ingestion.platform} order` : undefined,
      })

      onSaved()
      onOpenChange(false)
    } catch (error) {
      triggerHaptic(HAPTIC_ERROR)
      toast({
        title: "Save failed",
        description: (error as Error).message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh]">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {ingestion.platform ? `${ingestion.platform} Order` : "Email Order"}
            </SheetTitle>
            <SheetDescription>
              {[
                ingestion.order_date && `Ordered ${new Date(ingestion.order_date).toLocaleDateString()}`,
                ingestion.order_total && `Total: ${formatPrice(ingestion.order_total)}`,
                ingestion.order_id && `#${ingestion.order_id}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Review items before adding to inventory"}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-3 pb-4">
            <p className="text-sm font-medium">
              {includedCount} of {items.length} item{items.length !== 1 ? "s" : ""} selected
            </p>

            {items.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "rounded-lg border p-3 transition-all space-y-2",
                  item.included ? "bg-background" : "opacity-60 bg-muted/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={() => toggleItem(index)}
                    className="h-4 w-4 rounded mt-1 shrink-0 accent-primary"
                    aria-label={`Include ${item.name}`}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(index, "name", e.target.value)}
                      className="h-8 text-sm font-medium"
                      placeholder="Item name"
                      disabled={!item.included}
                    />

                    <Input
                      value={item.brand}
                      onChange={(e) => updateItem(index, "brand", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Brand (optional)"
                      disabled={!item.included}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={item.category}
                        onValueChange={(v) => updateItem(index, "category", v)}
                        disabled={!item.included}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={item.location}
                        onValueChange={(v) => updateItem(index, "location", v)}
                        disabled={!item.included}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {storageLocations.map((loc) => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <QuantityWithUnits
                      value={item.quantity}
                      unit={item.unit}
                      onChange={(q, u) => {
                        updateItem(index, "quantity", q)
                        updateItem(index, "unit", u)
                      }}
                    />

                    <div className="space-y-2">
                      <Input
                        type="date"
                        value={item.expiryDate}
                        onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                        className="h-8 text-sm"
                        disabled={!item.included}
                      />
                      <CurrencyInput
                        value={item.price}
                        onValueChange={(v) => updateItem(index, "price", v)}
                        placeholder="Price"
                        compact
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items found in this order</p>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="px-4 pb-4">
          <LoadingButton
            className="w-full"
            onClick={handleSave}
            isLoading={saving}
            disabled={includedCount === 0}
          >
            Add {includedCount} item{includedCount !== 1 ? "s" : ""} to inventory
          </LoadingButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
