"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Camera, Upload, FileText, X, Check, Loader2, ShoppingCart, Plus, Minus, ScanLine, Sparkles, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { MainLayout } from "@/components/main-layout"
import { addInventoryItem } from "@/lib/data"
import { useUserSettings } from "@/hooks/use-user-settings"
import { QuantityInput } from "@/components/quantity-input"
import { CurrencyInput } from "@/components/currency-input"

type DetectedType = "receipt" | "food" | "package" | null

export function AddItemForm() {
  const router = useRouter()
  const { settings } = useUserSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const formContainerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState("scan")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [detectedType, setDetectedType] = useState<DetectedType>(null)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [extractedItems, setExtractedItems] = useState<
    Array<{
      name: string
      category: string
      expiryDate: string
      quantity: number
      selected: boolean
      confidence: number
      price?: string
    }>
  >([])

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    expiryDate: "",
    location: "",
    quantity: 1,
    notes: "",
    price: "",
    currency: settings?.currency || "INR",
    brand: "",
    orderedFrom: "",
  })

  useEffect(() => {
    const metaViewport = document.querySelector("meta[name=viewport]")
    const originalContent = metaViewport?.getAttribute("content")
    metaViewport?.setAttribute("content", originalContent + ", maximum-scale=1.0")
    return () => {
      if (originalContent) {
        metaViewport?.setAttribute("content", originalContent)
      }
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    if (type === "number") {
      setFormData((prev) => ({ ...prev, [name]: Number.parseInt(value) || 0 }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const analyzeSteps = [
    "Detecting image type...",
    "Identifying items...",
    "Extracting details and quantities...",
    "Estimating expiry dates...",
  ]

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
      setIsAnalyzing(true)
      setAnalyzeStep(0)
      setDetectedType(null)

      // Simulate multi-step AI analysis
      const stepDuration = 700

      const timer1 = setTimeout(() => setAnalyzeStep(1), stepDuration)
      const timer2 = setTimeout(() => {
        setAnalyzeStep(2)
        // Simulate AI detecting whether this is a receipt or food photo
        const isReceipt = Math.random() > 0.5
        setDetectedType(isReceipt ? "receipt" : "food")
      }, stepDuration * 2)
      const timer3 = setTimeout(() => setAnalyzeStep(3), stepDuration * 3)
      const timer4 = setTimeout(() => {
        setIsAnalyzing(false)

        setExtractedItems([
          {
            name: "Organic Milk",
            category: "Dairy",
            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            quantity: 1,
            selected: true,
            confidence: 0.95,
            price: "65",
          },
          {
            name: "Eggs (12 pack)",
            category: "Dairy",
            expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            quantity: 1,
            selected: true,
            confidence: 0.87,
            price: "89",
          },
          {
            name: "Whole Wheat Bread",
            category: "Grains",
            expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            quantity: 1,
            selected: true,
            confidence: 0.92,
            price: "45",
          },
        ])
      }, stepDuration * 4)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
        clearTimeout(timer4)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (activeTab === "manual") {
      addInventoryItem({
        id: Date.now().toString(),
        ...formData,
        addedOn: new Date().toISOString(),
      })
    } else if (extractedItems.length > 0) {
      extractedItems
        .filter((item) => item.selected)
        .forEach((item) => {
          addInventoryItem({
            id: Date.now() + Math.random().toString(),
            name: item.name,
            category: item.category,
            expiryDate: new Date(item.expiryDate).toISOString(),
            location: formData.location || "Refrigerator",
            quantity: item.quantity,
            addedOn: new Date().toISOString(),
            notes: formData.notes,
            price: item.price || formData.price,
            brand: formData.brand,
            orderedFrom: formData.orderedFrom || undefined,
          })
        })
    }

    router.push("/dashboard")
  }

  const toggleItemSelection = (index: number) => {
    setExtractedItems((items) => items.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)))
  }

  const updateExtractedItem = (index: number, field: string, value: string | number) => {
    setExtractedItems((items) => items.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const resetImageUpload = () => {
    setImagePreview(null)
    setExtractedItems([])
    setDetectedType(null)
    setAnalyzeStep(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
  }

  const suggestedItems = [
    {
      name: "Milk",
      category: "Dairy",
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      location: "Refrigerator",
      quantity: 1,
      price: "65",
      reason: "Running low based on usage patterns",
    },
    {
      name: "Eggs",
      category: "Dairy",
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      location: "Refrigerator",
      quantity: 12,
      price: "89",
      reason: "Used frequently in your recipes",
    },
    {
      name: "Bread",
      category: "Grains",
      expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      location: "Pantry",
      quantity: 1,
      price: "45",
      reason: "You typically buy this weekly",
    },
  ]

  const handleAddSuggestedItem = (item: (typeof suggestedItems)[0]) => {
    addInventoryItem({
      id: Date.now().toString(),
      name: item.name,
      category: item.category,
      expiryDate: new Date(item.expiryDate).toISOString(),
      location: item.location,
      quantity: item.quantity,
      price: item.price,
      addedOn: new Date().toISOString(),
    })
    router.push("/dashboard")
  }

  const selectedCount = extractedItems.filter((i) => i.selected).length

  return (
    <MainLayout>
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" className="mr-2" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Add Item</h1>
      </div>

      <Tabs defaultValue="scan" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="scan" className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            <span>Scan</span>
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Manual</span>
          </TabsTrigger>
          <TabsTrigger value="suggested" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            <span>Suggested</span>
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          <div ref={formContainerRef} className="max-h-[calc(100vh-13rem)] overflow-y-auto pb-20">
            {/* Unified Scan Tab */}
            <TabsContent value="scan">
              <div className="space-y-6">
                {!imagePreview ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed rounded-xl p-8 text-center">
                      <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Smart Scan</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Upload a photo of food items, a grocery receipt, or product packaging. Our AI will automatically detect and extract all items.
                      </p>

                      <div className="flex flex-col gap-3">
                        <Button type="button" size="lg" className="w-full" onClick={handleCameraCapture}>
                          <Camera className="mr-2 h-5 w-5" />
                          Take a Photo
                        </Button>
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleImageUpload}
                        />

                        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleFileUpload}>
                          <ImageIcon className="mr-2 h-5 w-5" />
                          Upload from Gallery
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
                        <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center mb-2 border">
                          <Camera className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium">Food Items</span>
                      </div>
                      <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
                        <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center mb-2 border">
                          <FileText className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium">Receipts</span>
                      </div>
                      <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
                        <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center mb-2 border">
                          <ScanLine className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium">Packages</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium">AI Analysis</h3>
                        {detectedType && !isAnalyzing && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {detectedType === "receipt" ? "Receipt detected" : detectedType === "package" ? "Package detected" : "Food items detected"}
                          </Badge>
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={resetImageUpload}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Reset</span>
                      </Button>
                    </div>

                    <div className="relative mx-auto w-full h-48 bg-muted rounded-lg overflow-hidden">
                      <img
                        src={imagePreview || "/placeholder.svg"}
                        alt="Uploaded image preview"
                        className="w-full h-full object-cover"
                      />
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <div className="absolute inset-0 border-2 border-primary/50 rounded-lg animate-pulse" />
                        </div>
                      )}
                    </div>

                    {isAnalyzing ? (
                      <div className="space-y-3 py-4">
                        {analyzeSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            {i < analyzeStep ? (
                              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            ) : i === analyzeStep ? (
                              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                            ) : (
                              <div className="h-5 w-5 rounded-full border-2 border-muted shrink-0" />
                            )}
                            <span className={`text-sm ${i <= analyzeStep ? "text-foreground" : "text-muted-foreground"}`}>
                              {step}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {extractedItems.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium">
                                {selectedCount} of {extractedItems.length} items selected
                              </h3>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  const allSelected = extractedItems.every((i) => i.selected)
                                  setExtractedItems((items) =>
                                    items.map((item) => ({ ...item, selected: !allSelected }))
                                  )
                                }}
                              >
                                {extractedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
                              </Button>
                            </div>

                            <div className="space-y-3">
                              {extractedItems.map((item, index) => (
                                <Card key={index} className={`border transition-colors ${item.selected ? "border-primary bg-primary/[0.02]" : "opacity-60"}`}>
                                  <CardContent className="p-3">
                                    <div className="flex items-start gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={`h-6 w-6 rounded-full shrink-0 mt-0.5 ${
                                          item.selected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"
                                        }`}
                                        onClick={() => toggleItemSelection(index)}
                                      >
                                        {item.selected && <Check className="h-3 w-3" />}
                                        <span className="sr-only">{item.selected ? "Deselect" : "Select"}</span>
                                      </Button>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Input
                                            value={item.name}
                                            onChange={(e) => updateExtractedItem(index, "name", e.target.value)}
                                            className="h-8 text-sm font-medium"
                                          />
                                          <Badge variant="outline" className="text-[10px] shrink-0">
                                            {Math.round(item.confidence * 100)}%
                                          </Badge>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                          <Select
                                            value={item.category}
                                            onValueChange={(value) => updateExtractedItem(index, "category", value)}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="Fruits">Fruits</SelectItem>
                                              <SelectItem value="Vegetables">Vegetables</SelectItem>
                                              <SelectItem value="Dairy">Dairy</SelectItem>
                                              <SelectItem value="Meat">Meat</SelectItem>
                                              <SelectItem value="Grains">Grains</SelectItem>
                                              <SelectItem value="Canned">Canned</SelectItem>
                                              <SelectItem value="Frozen">Frozen</SelectItem>
                                              <SelectItem value="Snacks">Snacks</SelectItem>
                                              <SelectItem value="Beverages">Beverages</SelectItem>
                                              <SelectItem value="Condiments">Condiments</SelectItem>
                                              <SelectItem value="Other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>

                                          <Input
                                            type="date"
                                            value={item.expiryDate}
                                            onChange={(e) => updateExtractedItem(index, "expiryDate", e.target.value)}
                                            className="h-8 text-xs"
                                          />

                                          <div className="flex items-center border rounded-md">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 p-0 shrink-0"
                                              onClick={() =>
                                                updateExtractedItem(index, "quantity", Math.max(1, item.quantity - 1))
                                              }
                                            >
                                              <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="text-xs text-center flex-1">{item.quantity}</span>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 p-0 shrink-0"
                                              onClick={() => updateExtractedItem(index, "quantity", item.quantity + 1)}
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>

                                        <div className="mt-2">
                                          <CurrencyInput
                                            compact
                                            value={item.price || ""}
                                            onValueChange={(val) => updateExtractedItem(index, "price", val)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="scan-location">Storage Location</Label>
                                <Select
                                  value={formData.location}
                                  onValueChange={(value) => handleSelectChange("location", value)}
                                  required
                                >
                                  <SelectTrigger id="scan-location">
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(settings?.storageLocations || []).map((loc) => (
                                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="scan-orderedFrom">Ordered From (Optional)</Label>
                                <Select
                                  value={formData.orderedFrom}
                                  onValueChange={(value) => handleSelectChange("orderedFrom", value === "none" ? "" : value)}
                                >
                                  <SelectTrigger id="scan-orderedFrom">
                                    <SelectValue placeholder="Select source" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {(settings?.orderSources || []).map((source) => (
                                      <SelectItem key={source} value={source}>
                                        {source}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="scan-notes">Notes (Optional)</Label>
                                <Textarea
                                  id="scan-notes"
                                  name="notes"
                                  value={formData.notes}
                                  onChange={handleInputChange}
                                  placeholder="Add any additional notes"
                                  className="resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Item Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    autoFocus={false}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => handleSelectChange("category", value)}
                    required
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fruits">Fruits</SelectItem>
                      <SelectItem value="Vegetables">Vegetables</SelectItem>
                      <SelectItem value="Dairy">Dairy</SelectItem>
                      <SelectItem value="Meat">Meat</SelectItem>
                      <SelectItem value="Grains">Grains</SelectItem>
                      <SelectItem value="Canned">Canned</SelectItem>
                      <SelectItem value="Frozen">Frozen</SelectItem>
                      <SelectItem value="Snacks">Snacks</SelectItem>
                      <SelectItem value="Beverages">Beverages</SelectItem>
                      <SelectItem value="Condiments">Condiments</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <QuantityInput
                    id="quantity"
                    label="Quantity"
                    value={formData.quantity}
                    onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
                  />

                  <CurrencyInput
                    id="price"
                    label="Price"
                    value={formData.price}
                    currency={formData.currency}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, price: val }))}
                    onCurrencyChange={(cur) => setFormData((prev) => ({ ...prev, currency: cur }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Storage Location</Label>
                  <Select
                    value={formData.location}
                    onValueChange={(value) => handleSelectChange("location", value)}
                    required
                  >
                    <SelectTrigger id="location">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {(settings?.storageLocations || []).map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand (Optional)</Label>
                    <Input
                      id="brand"
                      name="brand"
                      value={formData.brand}
                      onChange={handleInputChange}
                      placeholder="Brand name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orderedFrom">Ordered From (Optional)</Label>
                    <Select
                      value={formData.orderedFrom}
                      onValueChange={(value) => handleSelectChange("orderedFrom", value === "none" ? "" : value)}
                    >
                      <SelectTrigger id="orderedFrom">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(settings?.orderSources || []).map((source) => (
                          <SelectItem key={source} value={source}>
                            {source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="Add any additional notes about this item"
                    className="resize-none"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="suggested">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Based on your inventory and usage patterns, we suggest adding these items:
                </p>

                <div className="space-y-3">
                  {suggestedItems.map((item, index) => (
                    <Card key={index} className="overflow-hidden">
                      <CardHeader className="p-3 pb-0">
                        <CardTitle className="text-base">{item.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-2">
                        <div className="text-sm text-muted-foreground mb-2">{item.reason}</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <div className="bg-muted px-2 py-1 rounded-md">{item.category}</div>
                          <div className="bg-muted px-2 py-1 rounded-md">Qty: {item.quantity}</div>
                          <div className="bg-muted px-2 py-1 rounded-md">{item.location}</div>
                          {item.price && (
                            <div className="bg-muted px-2 py-1 rounded-md">
                              Last price: {settings?.currency === "USD" ? "$" : settings?.currency === "EUR" ? "\u20AC" : "\u20B9"}{item.price}
                            </div>
                          )}
                        </div>
                      </CardContent>
                      <div className="border-t p-3 flex justify-end">
                        <Button type="button" size="sm" onClick={() => handleAddSuggestedItem(item)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add to Inventory
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
          </div>

          <div className="mt-6 sticky bottom-0 bg-background pt-4 pb-4 border-t">
            <Button
              type="submit"
              className="w-full"
              disabled={
                (activeTab === "scan" &&
                  (isAnalyzing || !imagePreview || selectedCount === 0)) ||
                (activeTab === "manual" &&
                  (!formData.name || !formData.category || !formData.expiryDate || !formData.location)) ||
                activeTab === "suggested"
              }
            >
              {activeTab === "scan"
                ? `Save${selectedCount > 0 ? ` (${selectedCount} item${selectedCount > 1 ? "s" : ""})` : ""}`
                : "Save Item"}
            </Button>
          </div>
        </form>
      </Tabs>
    </MainLayout>
  )
}
