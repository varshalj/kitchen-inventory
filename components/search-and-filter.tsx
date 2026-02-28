"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Filter, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { MainLayout } from "@/components/main-layout"
import { getInventoryItems } from "@/lib/client/api"
import type { InventoryItem } from "@/lib/types"

export function SearchAndFilter() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState("expiryDate")

  useEffect(() => {
    const load = async () => {
      setItems(await getInventoryItems())
    }

    void load()
  }, [])

  // Filter and sort items
  const filteredItems = items
    .filter((item) => {
      // Apply search filter
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Apply category filter
      if (filter === "expiring-soon") {
        const daysUntilExpiry = Math.ceil(
          (new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
        )
        return daysUntilExpiry <= 7
      } else if (filter !== "all" && item.category !== filter) {
        return false
      }

      return true
    })
    .sort((a, b) => {
      // Apply sorting
      if (sort === "expiryDate") {
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      } else if (sort === "name") {
        return a.name.localeCompare(b.name)
      } else if (sort === "category") {
        return a.category.localeCompare(b.category)
      } else if (sort === "location") {
        return a.location.localeCompare(b.location)
      }
      return 0
    })

  // Get unique categories for filter dropdown
  const categories = Array.from(new Set(items.map((item) => item.category)))

  // Function to determine card border color based on expiry date
  const getExpiryColor = (expiryDate: string) => {
    const daysUntilExpiry = Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))

    if (daysUntilExpiry <= 3) return "border-red-500"
    if (daysUntilExpiry <= 7) return "border-amber-500"
    return "border-green-500"
  }

  return (
    <MainLayout>
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" className="mr-2" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Search & Filter</h1>
      </div>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
              <span className="sr-only">Filter</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={filter} onValueChange={setFilter}>
              <DropdownMenuRadioItem value="all">All Items</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="expiring-soon">Expiring Soon (7 days)</DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Categories</DropdownMenuLabel>
              {categories.map((category) => (
                <DropdownMenuRadioItem key={category} value={category}>
                  {category}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel>Sort By</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenuRadioItem value="expiryDate">Expiry Date</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="category">Category</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="location">Location</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No items match your search</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <Card key={item.id} className={`${getExpiryColor(item.expiryDate)} border-l-4`}>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">{item.location}</p>
                  </div>
                  <Badge variant="outline">{item.category}</Badge>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-3 text-xs text-muted-foreground">
                Expires: {new Date(item.expiryDate).toLocaleDateString()}
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </MainLayout>
  )
}
