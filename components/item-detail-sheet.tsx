"use client"

import { useState } from "react"
import { Edit, Trash2, MapPin, Tag, Calendar, Package, DollarSign, StickyNote, Store, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { unitInput } from "@/lib/constants"
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

export interface PartialUseSpec {
  quantityConsumed: number
  quantityWasted: number
  wastageReason: string | null
}

interface ItemDetailSheetProps {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onPartialConsume: (item: InventoryItem, spec: PartialUseSpec) => void
}

export function ItemDetailSheet({ item, open, onOpenChange, onEdit, onDelete, onPartialConsume }: ItemDetailSheetProps) {
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
              <StarRating value={item.rating ?? 0} size="sm" readOnly />
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

          {!item.archived && Number(item.quantity) > 0 && (
            <PartialUsePanel
              key={item.id}
              item={item}
              onApply={(spec) => onPartialConsume(item, spec)}
            />
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

const PARTIAL_WASTE_REASONS = [
  { key: "expired", label: "Expired" },
  { key: "spoiled", label: "Spoiled" },
  { key: "unused", label: "Unused" },
  { key: "excess", label: "Too much" },
] as const

function PartialUsePanel({ item, onApply }: { item: InventoryItem; onApply: (spec: PartialUseSpec) => void }) {
  const cfg = unitInput(item.unit)
  const max = Number(item.quantity) || 0
  const round = (n: number) => {
    const f = 10 ** cfg.decimals
    return Math.max(0, Math.round(n * f) / f)
  }

  // Default: consume the whole item, waste nothing — one tap "Apply" = consume all.
  const [consumed, setConsumed] = useState(() => round(max))
  const [wasted, setWasted] = useState(0)
  const [reason, setReason] = useState<string | null>(null)

  const remaining = round(max - consumed - wasted)
  const fmt = (n: number) => formatQuantityUnit(round(n), item.unit)
  const pct = (n: number) => (max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0)

  const setC = (n: number) => setConsumed(round(Math.min(Math.max(0, n), max - wasted)))
  const setW = (n: number) => setWasted(round(Math.min(Math.max(0, n), max - consumed)))

  const canApply = consumed + wasted > 1e-6 && consumed + wasted <= max + 1e-6 && (wasted <= 1e-6 || !!reason)

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm font-medium">How much did you use?</p>

      <StepRow label="Consumed" tone="consume" value={consumed} unit={item.unit} cfg={cfg} max={round(max - wasted)} onChange={setC} />
      <StepRow label="Wasted" tone="waste" value={wasted} unit={item.unit} cfg={cfg} max={round(max - consumed)} onChange={setW} />

      {wasted > 1e-6 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Why was it wasted?</p>
          <div className="flex flex-wrap gap-1.5">
            {PARTIAL_WASTE_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  reason === r.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${pct(consumed)}%` }} />
        <div className="bg-red-500" style={{ width: `${pct(wasted)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {remaining > 1e-6 ? `${fmt(remaining)} will stay in inventory.` : "Nothing left — item will be archived."}
      </p>

      <Button
        className="w-full active:scale-95 transition-transform"
        disabled={!canApply}
        onClick={() => onApply({ quantityConsumed: consumed, quantityWasted: wasted, wastageReason: wasted > 1e-6 ? reason : null })}
      >
        Apply
      </Button>
    </div>
  )
}

function StepRow({
  label,
  tone,
  value,
  unit,
  cfg,
  max,
  onChange,
}: {
  label: string
  tone: "consume" | "waste"
  value: number
  unit?: string
  cfg: { discrete: boolean; step: number; decimals: number }
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${tone === "waste" ? "text-red-600 dark:text-red-400" : ""}`}>{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= 0}
          onClick={() => onChange(value - cfg.step)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        {cfg.discrete ? (
          <span className="w-20 text-center text-sm font-medium tabular-nums">
            {formatQuantityUnit(value, unit)}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              value={value}
              min={0}
              max={max}
              step={cfg.step}
              aria-label={label}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              className="h-7 w-16 rounded-md border bg-background text-center text-sm tabular-nums"
            />
            <span className="w-7 text-xs text-muted-foreground">{unit ?? "pcs"}</span>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + cfg.step)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
