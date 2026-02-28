"use client"

import { useMemo } from "react"
import { Info, TrendingUp, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { InventoryItem } from "@/lib/types"

interface InsightsPanelProps {
  items: InventoryItem[]
}

export function InsightsPanel({ items }: InsightsPanelProps) {
  const insights = useMemo(() => {
    // Count expiring soon items (within 7 days)
    const expiringSoon = items.filter((item) => {
      const daysUntilExpiry = Math.ceil(
        (new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
      )
      return daysUntilExpiry <= 7
    }).length

    // Count items by category
    const categoryCount: Record<string, number> = {}
    items.forEach((item) => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
    })

    // Get top category
    let topCategory = { name: "None", count: 0 }
    Object.entries(categoryCount).forEach(([category, count]) => {
      if (count > topCategory.count) {
        topCategory = { name: category, count }
      }
    })

    // Calculate inventory health score (0-100)
    // Higher score means better inventory health (fewer expiring items)
    const expiryRatio = items.length > 0 ? expiringSoon / items.length : 0
    const healthScore = Math.round((1 - expiryRatio) * 100)

    // Calculate potential waste
    // In a real app, this would be based on actual prices and usage patterns
    const potentialWaste = expiringSoon * 3.5 // Assuming average item cost of $3.50

    // Calculate consumption trends
    // In a real app, this would be based on historical data
    const consumptionTrend = items.filter((item) => item.consumedOn || item.partiallyConsumed).length

    return {
      totalItems: items.length,
      expiringSoon,
      topCategory: topCategory.name,
      healthScore,
      potentialWaste: potentialWaste.toFixed(2),
      consumptionTrend,
    }
  }, [items])

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center">Inventory Insights</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Info className="h-4 w-4" />
                  <span className="sr-only">Info</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Insights are calculated based on your inventory data, expiry dates, and usage patterns.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground">Total Items</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Total number of items in your inventory.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl font-bold">{insights.totalItems}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground">Expiring Soon</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Items expiring within the next 7 days.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl font-bold text-amber-500">{insights.expiringSoon}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground">Consumption Trend</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Number of items consumed recently.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center">
              <p className="text-lg font-medium">{insights.consumptionTrend}</p>
              <TrendingUp className="ml-2 h-4 w-4 text-green-500" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground">Potential Savings</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Estimated value of items that may be wasted if not used before expiry.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center">
              <p className="text-lg font-medium">${insights.potentialWaste}</p>
              <DollarSign className="ml-2 h-4 w-4 text-amber-500" />
            </div>
          </div>

          <div className="col-span-2 space-y-1">
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground">Inventory Health</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Overall health score of your inventory based on expiry dates and usage patterns.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    insights.healthScore > 80
                      ? "bg-green-500"
                      : insights.healthScore > 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${insights.healthScore}%` }}
                />
              </div>
              <span className="text-sm font-medium">{insights.healthScore}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
