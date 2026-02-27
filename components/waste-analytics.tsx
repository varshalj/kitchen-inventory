"use client"

import { useState, useMemo } from "react"
import { BarChart2, DollarSign, BarChart, PieChart, TrendingDown, AlertTriangle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MainLayout } from "@/components/main-layout"
import { getInventoryItems } from "@/lib/data"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function WasteAnalytics() {
  const [timeFrame, setTimeFrame] = useState("month")
  const items = useMemo(() => getInventoryItems(), [])
  const [activeTab, setActiveTab] = useState("overview")

  // In a real app, these would be calculated from actual usage data
  const analytics = useMemo(() => {
    // Get expired items
    const currentDate = new Date()
    const expiredItems = items.filter((item) => new Date(item.expiryDate) < currentDate)

    // Calculate potential waste
    const potentialWaste = expiredItems.reduce((total, item) => {
      // Assuming each item has an average value of $5
      return total + (item.quantity || 1) * 5
    }, 0)

    // Calculate waste by category
    const wasteByCategory: Record<string, number> = {}
    expiredItems.forEach((item) => {
      wasteByCategory[item.category] = (wasteByCategory[item.category] || 0) + 1
    })

    // Sort categories by waste amount
    const topWasteCategories = Object.entries(wasteByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return {
      totalItems: items.length,
      expiredItems: expiredItems.length,
      wastePercentage: items.length ? Math.round((expiredItems.length / items.length) * 100) : 0,
      potentialWaste,
      expiryTrend: -5, // Mock trend data (negative is good - less waste)
      topWasteCategories,
      monthlySavings: 45, // Mock data
    }
  }, [items])

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center">
          <BarChart2 className="mr-2 h-5 w-5" />
          Waste Analytics
        </h1>
        <Select value={timeFrame} onValueChange={setTimeFrame}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select time frame" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="quarter">Last Quarter</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mb-20">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-500" />
                  Wasted Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.expiredItems}</div>
                <p className="text-xs text-muted-foreground">{analytics.wastePercentage}% of inventory</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <DollarSign className="mr-2 h-4 w-4 text-amber-500" />
                  Potential Savings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.potentialWaste}</div>
                <p className="text-xs text-muted-foreground">If expired items were used</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center">
                <TrendingDown className="mr-2 h-4 w-4 text-green-500" />
                Waste Reduction
              </CardTitle>
              <CardDescription>Compared to last {timeFrame}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-2xl font-bold text-green-500">{Math.abs(analytics.expiryTrend)}%</div>
                <TrendingDown className="ml-2 h-5 w-5 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                You've saved approximately ${analytics.monthlySavings} by reducing waste
              </p>

              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Monthly Trend</div>
                <div className="space-y-2">
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => (
                    <div key={month} className="flex items-center gap-2">
                      <div className="w-12 text-xs">{month}</div>
                      <div className="h-2 bg-muted rounded-full flex-1 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.random() * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center">
                  <PieChart className="mr-2 h-4 w-4" />
                  Top Waste Categories
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">These categories have the most expired items.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.topWasteCategories.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topWasteCategories.map(([category, count]) => (
                    <div key={category} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span>{category}</span>
                        <span className="font-medium">{count} items</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${(count / analytics.topWasteCategories[0][1]) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No wasted items to analyze.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4 mb-20">
          <Card>
            <CardHeader>
              <CardTitle>Waste Trends</CardTitle>
              <CardDescription>How your food waste has changed over time</CardDescription>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BarChart className="h-10 w-10 mx-auto mb-2" />
                <p>Waste trend charts would appear here</p>
                <p className="text-sm mt-1">Tracking food waste over time</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4 mb-20">
          <Card>
            <CardHeader>
              <CardTitle>Waste Reduction Insights</CardTitle>
              <CardDescription>Tips to reduce food waste based on your patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 rounded-md">
                  <h3 className="font-medium">Buy smaller quantities of dairy products</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dairy items are your most commonly wasted category.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 rounded-md">
                  <h3 className="font-medium">Plan meals around expiring vegetables</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You could save approximately $15/month by using vegetables before they expire.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 rounded-md">
                  <h3 className="font-medium">Shop twice a week rather than once</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Fresh items might last longer with more frequent, smaller shopping trips.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  )
}
