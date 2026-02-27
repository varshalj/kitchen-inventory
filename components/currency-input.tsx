"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUserSettings } from "@/hooks/use-user-settings"

export const CURRENCIES = [
  { code: "INR", symbol: "\u20B9", label: "Indian Rupee (\u20B9)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "\u20AC", label: "Euro (\u20AC)" },
  { code: "GBP", symbol: "\u00A3", label: "British Pound (\u00A3)" },
]

interface CurrencyInputProps {
  id?: string
  label?: string
  value: string
  currency?: string
  onValueChange: (value: string) => void
  onCurrencyChange?: (currency: string) => void
  placeholder?: string
  className?: string
  compact?: boolean
}

export function CurrencyInput({
  id,
  label,
  value,
  currency: currencyProp,
  onValueChange,
  onCurrencyChange,
  placeholder,
  className = "",
  compact = false,
}: CurrencyInputProps) {
  const { settings } = useUserSettings()
  const [activeCurrency, setActiveCurrency] = useState(currencyProp || settings?.currency || "INR")

  useEffect(() => {
    if (currencyProp) {
      setActiveCurrency(currencyProp)
    } else if (settings?.currency) {
      setActiveCurrency(settings.currency)
    }
  }, [currencyProp, settings?.currency])

  const currencyInfo = CURRENCIES.find((c) => c.code === activeCurrency) || CURRENCIES[0]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.]/g, "")
    onValueChange(raw)
  }

  const handleCurrencySelect = (code: string) => {
    setActiveCurrency(code)
    onCurrencyChange?.(code)
  }

  const displayPlaceholder = placeholder || "0.00"

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-xs text-muted-foreground shrink-0">{currencyInfo.symbol}</span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder={displayPlaceholder}
          className="h-8 text-xs px-1.5"
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex items-center mt-1.5">
        <Select value={activeCurrency} onValueChange={handleCurrencySelect}>
          <SelectTrigger className="h-9 w-[4.5rem] rounded-r-none border-r-0 shrink-0 text-sm">
            <span>{currencyInfo.symbol} {currencyInfo.code}</span>
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.symbol} {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder={displayPlaceholder}
          className="h-9 rounded-l-none"
        />
      </div>
    </div>
  )
}
