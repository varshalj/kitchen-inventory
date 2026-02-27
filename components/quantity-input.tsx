"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface QuantityInputProps {
  id?: string
  label?: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  className?: string
  disabled?: boolean
}

export function QuantityInput({
  id,
  label,
  value,
  min = 1,
  max = 999,
  onChange,
  className = "",
  disabled = false,
}: QuantityInputProps) {
  const [inputValue, setInputValue] = useState<string>(value.toString())

  useEffect(() => {
    setInputValue(value.toString())
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)

    const parsedValue = Number.parseInt(newValue, 10)
    if (!isNaN(parsedValue)) {
      // Only update parent component if value is a valid number
      onChange(Math.max(min, Math.min(max, parsedValue)))
    }
  }

  const handleBlur = () => {
    const parsedValue = Number.parseInt(inputValue, 10)
    if (isNaN(parsedValue)) {
      // Reset to min value if input is not a valid number
      setInputValue(min.toString())
      onChange(min)
    } else {
      // Ensure value is within bounds
      const boundedValue = Math.max(min, Math.min(max, parsedValue))
      setInputValue(boundedValue.toString())
      onChange(boundedValue)
    }
  }

  const increment = () => {
    if (value < max) {
      const newValue = value + 1
      setInputValue(newValue.toString())
      onChange(newValue)
    }
  }

  const decrement = () => {
    if (value > min) {
      const newValue = value - 1
      setInputValue(newValue.toString())
      onChange(newValue)
    }
  }

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex items-center mt-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-r-none"
          onClick={decrement}
          disabled={disabled || value <= min}
        >
          <Minus className="h-3 w-3" />
          <span className="sr-only">Decrease</span>
        </Button>

        <Input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className="h-8 rounded-none text-center w-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          disabled={disabled}
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-l-none"
          onClick={increment}
          disabled={disabled || value >= max}
        >
          <Plus className="h-3 w-3" />
          <span className="sr-only">Increase</span>
        </Button>
      </div>
    </div>
  )
}
