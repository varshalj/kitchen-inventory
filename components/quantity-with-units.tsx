"use client"

import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const UNIT_GROUPS = [
  {
    label: "Pieces",
    units: ["pcs", "dozen"],
  },
  {
    label: "Weight",
    units: ["g", "kg", "oz", "lb"],
  },
  {
    label: "Volume",
    units: ["ml", "L", "fl oz", "cup"],
  },
]

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units)

/** Format a quantity + unit pair for display, e.g. "500g" or "2 pcs" */
export function formatQuantityUnit(quantity?: number, unit?: string): string {
  const qty = quantity ?? 1
  const u = unit ?? "pcs"
  return u === "pcs" ? `×${qty}` : `${qty}${u}`
}

interface QuantityWithUnitsProps {
  value: number
  unit: string
  onChange: (value: number, unit: string) => void
  label?: string
  id?: string
  className?: string
  min?: number
  step?: number
}

export function QuantityWithUnits({
  value,
  unit,
  onChange,
  label,
  id,
  className,
  min = 0.1,
  step = 1,
}: QuantityWithUnitsProps) {
  const handleDecrement = () => {
    const next = Math.max(min, parseFloat((value - step).toFixed(3)))
    onChange(next, unit)
  }

  const handleIncrement = () => {
    const next = parseFloat((value + step).toFixed(3))
    onChange(next, unit)
  }

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value)
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed, unit)
    } else if (e.target.value === "" || e.target.value === "-") {
      onChange(0, unit)
    }
  }

  const handleUnitChange = (newUnit: string) => {
    onChange(value, newUnit)
  }

  return (
    <div className={className}>
      {label && <Label htmlFor={id} className="mb-2 block">{label}</Label>}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleDecrement}
          disabled={value <= min}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3 w-3" />
        </Button>

        <Input
          id={id}
          type="number"
          value={value === 0 ? "" : value}
          onChange={handleValueChange}
          min={min}
          step="any"
          className="w-16 text-center px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label="Quantity"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleIncrement}
          aria-label="Increase quantity"
        >
          <Plus className="h-3 w-3" />
        </Button>

        <Select value={unit} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-[90px] shrink-0" aria-label="Unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-xs">{group.label}</SelectLabel>
                {group.units.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
