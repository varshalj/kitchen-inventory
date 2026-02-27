"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"

interface AdvancedFiltersProps {
  filters: {
    expiryDateRange: { min: string; max: string }
    categories: string[]
    locations: string[]
    quantityRange: { min: number; max: number }
  }
  categories: string[]
  locations: string[]
  onApply: (filters: AdvancedFiltersProps["filters"]) => void
  onReset: () => void
}

export function AdvancedFilters({ filters, categories, locations, onApply, onReset }: AdvancedFiltersProps) {
  const [localFilters, setLocalFilters] = useState(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const handleExpiryDateChange = (field: "min" | "max", value: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      expiryDateRange: {
        ...prev.expiryDateRange,
        [field]: value,
      },
    }))
  }

  const handleCategoryToggle = (category: string) => {
    setLocalFilters((prev) => {
      const isSelected = prev.categories.includes(category)
      return {
        ...prev,
        categories: isSelected ? prev.categories.filter((c) => c !== category) : [...prev.categories, category],
      }
    })
  }

  const handleLocationToggle = (location: string) => {
    setLocalFilters((prev) => {
      const isSelected = prev.locations.includes(location)
      return {
        ...prev,
        locations: isSelected ? prev.locations.filter((l) => l !== location) : [...prev.locations, location],
      }
    })
  }

  const handleQuantityChange = (values: number[]) => {
    setLocalFilters((prev) => ({
      ...prev,
      quantityRange: {
        min: values[0],
        max: values[1],
      },
    }))
  }

  return (
    <div className="py-4 space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Expiry Date Range</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min-date">From</Label>
            <Input
              id="min-date"
              type="date"
              value={localFilters.expiryDateRange.min}
              onChange={(e) => handleExpiryDateChange("min", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-date">To</Label>
            <Input
              id="max-date"
              type="date"
              value={localFilters.expiryDateRange.max}
              onChange={(e) => handleExpiryDateChange("max", e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Quantity Range</h3>
        <div className="px-2">
          <Slider
            defaultValue={[localFilters.quantityRange.min, localFilters.quantityRange.max]}
            max={100}
            step={1}
            onValueChange={handleQuantityChange}
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{localFilters.quantityRange.min}</span>
            <span>{localFilters.quantityRange.max}</span>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Categories</h3>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((category) => (
            <div key={category} className="flex items-center space-x-2">
              <Checkbox
                id={`category-${category}`}
                checked={localFilters.categories.includes(category)}
                onCheckedChange={() => handleCategoryToggle(category)}
              />
              <Label htmlFor={`category-${category}`} className="text-sm cursor-pointer">
                {category}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Storage Locations</h3>
        <div className="grid grid-cols-2 gap-2">
          {locations.map((location) => (
            <div key={location} className="flex items-center space-x-2">
              <Checkbox
                id={`location-${location}`}
                checked={localFilters.locations.includes(location)}
                onCheckedChange={() => handleLocationToggle(location)}
              />
              <Label htmlFor={`location-${location}`} className="text-sm cursor-pointer">
                {location}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onReset}>
          Reset Filters
        </Button>
        <Button onClick={() => onApply(localFilters)}>Apply Filters</Button>
      </div>
    </div>
  )
}
