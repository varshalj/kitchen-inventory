"use client"

import { Edit, Trash2, MapPin, Tag, Calendar, Package, DollarSign, StickyNote, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { StarRating } from "@/components/star-rating"
import { formatQuantityUnit } from "@/components/quantity-with-units"
import { CURRENCIES } from "@/components/currency-input"
import { useUserSettings } from "@/hooks/use-user-settings"
import type { InventoryItem } from "@/lib/types"

function formatPrice(price: string | undefined): string {
  const n = parseFloat(price ?? "")
  return isNaN(n) ? (price ?? "") : n.toFixed(2)
}

interface ItemDetailSheetProps {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
}

export function ItemDetailSheet({ item, open, onOpenChange, onEdit, onDelete }: ItemDetailSheetProps) {
  const { settings } = useUserSettings()
  const currencySymbol = (CURRENCIES.find((c) => c.code === (settings?.currency || "INR")) || CURRENCIES[0]).symbol

  if (!item) return null

  const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date()
  const isMissingExpiry = !item.expiryDate || isNaN(new Date(item.expiryDate).getTime())

  const daysUntilExpiry = item.expiryDate
    ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24))
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh]">
        <div className="flex-1 min-h-0 overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-xl">
                {item.brand && <span className="text-muted-foreground font-normal">{item.brand} </span>}
                {item.name}
              </SheetTitle>
              <SheetDescription>
                {item.location}
              </SheetDescription>
            </div>
            <Badge
              variant={isExpired ? "destructive" : isMissingExpiry ? "secondary" : "outline"}
              className="shrink-0"
            >
              {isExpired
                ? "Expired"
                : isMissingExpiry
                  ? "No expiry"
                  : daysUntilExpiry !== null && daysUntilExpiry <= 7
                    ? `${daysUntilExpiry}d left`
                    : "Fresh"}
            </Badge>
          </div>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow icon={<Tag className="h-4 w-4" />} label="Category" value={item.category} />
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={item.location} />
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Expiry Date"
              value={isMissingExpiry ? "Not set" : new Date(item.expiryDate).toLocaleDateString()}
            />
            <DetailRow
              icon={<Package className="h-4 w-4" />}
              label="Quantity"
              value={formatQuantityUnit(item.quantity, item.unit)}
            />
            {item.price && (
              <DetailRow icon={<DollarSign className="h-4 w-4" />} label="Price" value={`${currencySymbol}${formatPrice(item.price)}`} />
            )}
            {item.orderedFrom && (
              <DetailRow icon={<Store className="h-4 w-4" />} label="Ordered From" value={item.orderedFrom} />
            )}
          </div>

          {(item.rating ?? 0) > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm text-muted-foreground">Rating:</span>
              <StarRating value={item.rating} size="sm" readOnly />
            </div>
          )}

          {item.notes && (
            <div className="flex items-start gap-2 text-sm">
              <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <span className="text-muted-foreground">Notes: </span>
                {item.notes}
              </div>
            </div>
          )}

          {item.addedOn && (
            <p className="text-xs text-muted-foreground">
              Added on {new Date(item.addedOn).toLocaleDateString()}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 active:scale-95 transition-transform"
              onClick={() => {
                onOpenChange(false)
                onEdit(item)
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              className="flex-1 active:scale-95 transition-transform"
              onClick={() => {
                onOpenChange(false)
                onDelete(item)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  )
}
