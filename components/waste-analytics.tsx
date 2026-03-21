"use client"

import { useEffect, useState } from "react"
import { BarChart2, DollarSign, PieChart, TrendingDown, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MainLayout } from "@/components/main-layout"
import { LoadingTip } from "@/components/loading-tip"
import { fetchWithAuth } from "@/lib/api-client"

type TimeFrame = "week" | "month" | "quarter" | "year"

interface InventoryItem {
  id: string
  name: string
  category: string
  price?: string
  archiveReason?: "consumed" | "wasted"
  archived?: boolean
  wastedOn?: string
  addedOn?: string
}

export function WasteAnalytics() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("month")
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth("/api/inventory?archived=true")
        const data = await res.json()
        setItems(data || [])
      } catch (err) {
        console.error("Failed to load analytics data", err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const now = new Date()

  const getCutoffDate = () => {
    const d = new Date()
    if (timeFrame === "week") d.setDate(d.getDate() - 7)
    if (timeFrame === "month") d.setMonth(d.getMonth() - 1)
    if (timeFrame === "quarter") d.setMonth(d.getMonth() - 3)
    if (timeFrame === "year") d.setFullYear(d.getFullYear() - 1)
    return d
  }

  const cutoff = getCutoffDate()

  const filtered = items.filter(
    (i) =>
      i.archiveReason === "wasted" &&
      i.wastedOn &&
      new Date(i.wastedOn) >= cutoff
  )

  const totalWasted = filtered.length

  const totalInventory = items.length || 1
  const wastePercentage = Math.round((totalWasted / totalInventory) * 100)

  const potentialWaste = filtered.reduce((sum, item) => {
    const price = parseFloat(item.price || "0")
    return sum + (isNaN(price) ? 0 : price)
  }, 0)

  const categoryMap: Record<string, number> = {}

  filtered.forEach((item) => {
    categoryMap[item.category] = (categoryMap[item.category] || 0) + 1
  })

  const topWasteCategories = Object.entries(categoryMap).sort(
    (a, b) => b[1] - a[1]
  )

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center">
          <BarChart2 className="mr-2 h-5 w-5" />
          Waste Analytics
        </h1>

        <Select value={timeFrame} onValueChange={(v) => setTimeFrame(v as TimeFrame)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="quarter">Last Quarter</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
          <LoadingTip />
        </div>
      ) : (
        <div className="space-y-4 mb-20">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-500" />
                  Wasted Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalWasted}</div>
                <p className="text-xs text-muted-foreground">
                  {wastePercentage}% of archived inventory
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <DollarSign className="mr-2 h-4 w-4 text-amber-500" />
                  Potential Waste
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{potentialWaste.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on item price field
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <PieChart className="mr-2 h-4 w-4" />
                Top Waste Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topWasteCategories.length > 0 ? (
                <div className="space-y-3">
                  {topWasteCategories.map(([category, count]) => (
                    <div key={category} className="flex justify-between text-sm">
                      <span>{category}</span>
                      <span>{count} items</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No waste data for selected time frame.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  )
}
