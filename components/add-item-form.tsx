"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Camera, Upload, FileText, X, Check, Loader2, ShoppingCart, Plus, ScanLine, Sparkles, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { MainLayout } from "@/components/main-layout"
import { addInventoryItem, updateShoppingItem, fetchPendingShare, deletePendingShare } from "@/lib/client/api"
import { ToastAction } from "@/components/ui/toast"
import type { InventoryItem } from "@/lib/types"
import { useUserSettings } from "@/hooks/use-user-settings"
import { QuantityWithUnits } from "@/components/quantity-with-units"
import { CurrencyInput } from "@/components/currency-input"
import { useToast } from "@/hooks/use-toast"
import { BugReportDialog } from "@/components/bug-report-dialog"
import { useBugReportNudge } from "@/hooks/use-bug-report-nudge"

type DetectedType = "receipt" | "food" | "package" | null
type ProposalResponse = {
  proposals: Array<{
    name: string
    brand?: string
    category: string
    expiryDate: string
    quantity: number
    price?: string
  }>
  confidence: number
  reasoning: string
  confidenceThreshold: number
  canBulkApply: boolean
}
import { fetchWithAuth } from "@/lib/api-client"

/** Convert HEIC/HEIF files to JPEG using heic2any (WASM-based decoder).
 *  Canvas and blob URL approaches both fail for HEIC in iOS WebKit's
 *  programmatic Image API — confirmed by runtime logs showing img.onerror
 *  fires immediately. heic2any handles this correctly via libheif/WASM. */
async function convertToJpegIfNeeded(file: File): Promise<string> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif")

  if (!isHeic) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(file)
    })
  }

  // Lazy-load heic2any to avoid adding it to the main bundle
  const heic2any = (await import("heic2any")).default
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
  const jpegBlob = Array.isArray(result) ? result[0] : result
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Failed to read converted HEIC"))
    reader.readAsDataURL(jpegBlob)
  })
}

export function AddItemForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { settings } = useUserSettings()
  const { toast } = useToast()
  const { toastWithNudge, bugReportOpen, setBugReportOpen } = useBugReportNudge()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const formContainerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState("scan")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [addingSuggestedId, setAddingSuggestedId] = useState<string | null>(null)
  const [detectedType, setDetectedType] = useState<DetectedType>(null)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [extractedItems, setExtractedItems] = useState<
    Array<{
      name: string
      brand?: string
      category: string
      expiryDate: string
      quantity: number
      unit: string
      confidence: number
      price?: string
      included: boolean
    }>
  >([])
  const [reviewSummary, setReviewSummary] = useState<{ confidence: number; threshold: number; reasoning: string } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    expiryDate: "",
    location: "",
    quantity: 1,
    unit: "pcs",
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

  // Pre-load shared image from share target (PWA share sheet)
  useEffect(() => {
    const shareId = searchParams.get("shareId")
    if (!shareId) return
    let cancelled = false
    ;(async () => {
      const imageData = await fetchPendingShare(shareId)
      if (cancelled || !imageData) return
      setImagePreviews([imageData])
      // Clean URL and delete the temporary share
      router.replace("/add-item", { scroll: false })
      deletePendingShare(shareId).catch(() => {})
    })()
    return () => { cancelled = true }
  }, [searchParams, router])

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

  // Camera capture — single image, auto-extract immediately (unchanged behaviour)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    convertToJpegIfNeeded(file).then((imageData) => {
      setImagePreview(imageData)
      setIsAnalyzing(true)
      setAnalyzeStep(0)
      setDetectedType(null)
      setScanError(null)

      const stepDuration = 700
      const timer1 = setTimeout(() => setAnalyzeStep(1), stepDuration)
      const timer2 = setTimeout(() => { setAnalyzeStep(2); setDetectedType("food") }, stepDuration * 2)
      const timer3 = setTimeout(() => setAnalyzeStep(3), stepDuration * 3)
      setTimeout(async () => {
        try {
          const singlePayload = JSON.stringify({
            userInput: "Extract all grocery and food items from this image. Identify item names, brands, categories, quantities, and estimate expiry dates.",
            imageBase64: imageData,
          })
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'add-item-form.tsx:cameraCapture',message:'single image payload',data:{payloadBytes:singlePayload.length},timestamp:Date.now(),hypothesisId:'H1-single'})}).catch(()=>{});
          // #endregion agent log
          const response = await fetchWithAuth("/api/ai/propose-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: singlePayload,
          })

          if (!response.ok) {
            const errBody = await response.json().catch(() => null)
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'add-item-form.tsx:cameraCapture:error',message:'single image API error',data:{status:response.status,statusText:response.statusText,errBody},timestamp:Date.now(),hypothesisId:'H1-single'})}).catch(()=>{});
            // #endregion agent log
            throw new Error(errBody?.error || "AI proposal request failed")
          }

          const payload = (await response.json()) as ProposalResponse
          setExtractedItems(
            payload.proposals.map((proposal) => ({
              ...proposal,
              unit: (proposal as any).unit || "pcs",
              confidence: payload.confidence,
              included: true,
            }))
          )
          setReviewSummary({
            confidence: payload.confidence,
            threshold: payload.confidenceThreshold,
            reasoning: payload.reasoning,
          })
        } catch {
          setScanError("Could not generate AI proposals. Please try again.")
          setExtractedItems([])
          setReviewSummary(null)
        } finally {
          setIsAnalyzing(false)
          clearTimeout(timer1)
          clearTimeout(timer2)
          clearTimeout(timer3)
        }
      }, stepDuration * 4)
    }).catch(() => {
      setScanError("Could not process this image. Please try a JPEG or PNG photo.")
    })
  }

  // Gallery — select up to 5 images, show preview strip, user clicks Analyze
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || [])
    if (newFiles.length === 0) return
    // Reset input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = ""

    const remaining = 5 - selectedFiles.length
    if (remaining <= 0) {
      toast({ title: "Maximum 5 images", description: "Remove an image before adding more.", variant: "destructive" })
      return
    }
    const filesToAdd = newFiles.slice(0, remaining)
    if (newFiles.length > remaining) {
      toast({ title: "Max 5 images", description: `Only ${remaining} more image${remaining !== 1 ? "s" : ""} added.` })
    }

    Promise.all(
      filesToAdd.map((file) => convertToJpegIfNeeded(file))
    ).then((previews) => {
      setSelectedFiles((prev) => [...prev, ...filesToAdd])
      setImagePreviews((prev) => [...prev, ...previews])
    }).catch((err: Error) => {
      toast({ title: "Image error", description: err.message, variant: "destructive" })
    })
  }

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // Triggered when user clicks "Analyze X image(s)" on the preview strip
  const handleAnalyze = () => {
    if (imagePreviews.length === 0) return
    setImagePreview(imagePreviews[0]) // switch to analysis UI
    setIsAnalyzing(true)
    setAnalyzeStep(0)
    setDetectedType(null)
    setScanError(null)

    const stepDuration = 700
    const timer1 = setTimeout(() => setAnalyzeStep(1), stepDuration)
    const timer2 = setTimeout(() => { setAnalyzeStep(2); setDetectedType("food") }, stepDuration * 2)
    const timer3 = setTimeout(() => setAnalyzeStep(3), stepDuration * 3)
    setTimeout(async () => {
      try {
        const count = imagePreviews.length
        const bodyPayload = JSON.stringify({
          userInput: `Extract all grocery and food items from ${count > 1 ? `these ${count} kitchen/pantry images` : "this kitchen/pantry image"}. Identify item names, brands, categories, quantities, and estimate expiry dates.`,
          imagesBase64: imagePreviews,
        })
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'add-item-form.tsx:handleAnalyze',message:'payload size',data:{imageCount:count,payloadBytes:bodyPayload.length,perImageBytes:imagePreviews.map((p:string)=>p.length)},timestamp:Date.now(),hypothesisId:'H1-client'})}).catch(()=>{});
        // #endregion agent log
        const response = await fetchWithAuth("/api/ai/propose-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyPayload,
        })

        if (!response.ok) {
          const errBody = await response.json().catch(() => null)
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/72c94e8d-cbb3-4204-8fea-137a739b0fb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'add-item-form.tsx:handleAnalyze:error',message:'API returned error',data:{status:response.status,statusText:response.statusText,errBody},timestamp:Date.now(),hypothesisId:'H1-client'})}).catch(()=>{});
          // #endregion agent log
          throw new Error(errBody?.error || "AI proposal request failed")
        }

        const payload = (await response.json()) as ProposalResponse
        setExtractedItems(
          payload.proposals.map((proposal) => ({
            ...proposal,
            unit: (proposal as any).unit || "pcs",
            confidence: payload.confidence,
            included: true,
          }))
        )
        setReviewSummary({
          confidence: payload.confidence,
          threshold: payload.confidenceThreshold,
          reasoning: payload.reasoning,
        })
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Could not analyse image. Please try again.")
        setExtractedItems([])
        setReviewSummary(null)
      } finally {
        setIsAnalyzing(false)
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }, stepDuration * 4)
  }

  const undoShoppingComplete = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => updateShoppingItem({ id, completed: false } as any)))
    } catch {
      // ignore undo errors
    }
  }

  const showShoppingMatchToast = (matched: Array<{ id: string; name: string }>) => {
    if (matched.length === 0) return
    const names = matched.map((m) => m.name).join(", ")
    const progressBar = (
      <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full">
        <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
      </div>
    )
    toast({
      title: `${matched.length} shopping list item${matched.length > 1 ? "s" : ""} marked as bought`,
      description: (
        <>
          {names}
          {progressBar}
        </>
      ),
      duration: 5000,
      action: (
        <ToastAction altText="Undo" onClick={() => undoShoppingComplete(matched.map((m) => m.id))}>
          Undo
        </ToastAction>
      ),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (activeTab === "manual") {
        const { completedShoppingItems } = await addInventoryItem({
          ...formData,
          unit: formData.unit || "pcs",
          addedOn: new Date().toISOString(),
        } as unknown as InventoryItem)
        toast({ title: "Item Saved", description: `${formData.name} has been added to your inventory.` })
        showShoppingMatchToast(completedShoppingItems)
      } else if (extractedItems.length > 0) {
        const approved = extractedItems.filter((entry) => entry.included)
        const allCompleted: Array<{ id: string; name: string }> = []
        for (const item of approved) {
          const { completedShoppingItems } = await addInventoryItem({
            name: item.name,
            category: item.category,
            expiryDate: new Date(item.expiryDate).toISOString(),
            location: formData.location || "Refrigerator",
            quantity: item.quantity,
            unit: item.unit || "pcs",
            addedOn: new Date().toISOString(),
            notes: formData.notes,
            price: item.price || formData.price,
            brand: item.brand || formData.brand || undefined,
            orderedFrom: formData.orderedFrom || undefined,
          } as unknown as InventoryItem)
          allCompleted.push(...completedShoppingItems)
        }
        toast({
          title: "Items Saved",
          description: `${approved.length} item${approved.length !== 1 ? "s" : ""} added to your inventory.`,
        })
        showShoppingMatchToast(allCompleted)
      }

      router.push("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save item"
      toastWithNudge({ title: "Save Failed", description: message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const toggleItemIncluded = (index: number) => {
    setExtractedItems((items) =>
      items.map((item, i) => (i === index ? { ...item, included: !item.included } : item))
    )
  }

  const updateExtractedItem = (index: number, field: string, value: string | number) => {
    setExtractedItems((items) =>
      items.map((item, i) =>
        i === index ? { ...item, [field]: value, included: true } : item
      )
    )
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
    setSelectedFiles([])
    setImagePreviews([])
    setExtractedItems([])
    setDetectedType(null)
    setAnalyzeStep(0)
    setReviewSummary(null)
    setScanError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
  }

  // Autocomplete state for the name field in the manual tab
  const [allInventoryNames, setAllInventoryNames] = useState<string[]>([])
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)

  // Scan review — "+ Add item" row
  const [scanAddingItem, setScanAddingItem] = useState(false)
  const [scanNewItemName, setScanNewItemName] = useState("")
  const [scanNewItemSuggestions, setScanNewItemSuggestions] = useState<string[]>([])
  const scanSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchScanItemSuggestions = (query: string) => {
    if (scanSuggestTimerRef.current) clearTimeout(scanSuggestTimerRef.current)
    if (!query.trim()) { setScanNewItemSuggestions([]); return }
    const q = query.toLowerCase()
    const results = allInventoryNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 5)
    setScanNewItemSuggestions(results)
  }

  const commitScanNewItem = (name: string) => {
    const trimmed = name.trim()
    if (trimmed) {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      setExtractedItems((prev) => [
        ...prev,
        {
          name: trimmed,
          included: true,
          category: "Other",
          quantity: 1,
          unit: "pcs",
          expiryDate: sevenDaysFromNow,
          confidence: 0,
          price: "",
          brand: "",
        },
      ])
    }
    setScanAddingItem(false)
    setScanNewItemName("")
    setScanNewItemSuggestions([])
  }

  const computeNameSuggestions = useCallback(
    (query: string) => {
      if (!query.trim()) { setNameSuggestions([]); return }
      const q = query.toLowerCase()
      const seen = new Set<string>()
      const results: string[] = []
      for (const name of allInventoryNames) {
        const lower = name.toLowerCase()
        if (seen.has(lower)) continue
        if (lower.includes(q)) {
          seen.add(lower)
          results.push(name)
          if (results.length >= 5) break
        }
      }
      setNameSuggestions(results)
    },
    [allInventoryNames]
  )

  const handleNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange(e)
    computeNameSuggestions(e.target.value)
    setShowNameSuggestions(true)
  }

  const [suggestedItems, setSuggestedItems] = useState<
    Array<{ name: string; category: string; expiryDate: string; location: string; quantity: number; price: string; reason: string }>
  >([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)

  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const [archivedRes, activeRes, shoppingRes] = await Promise.all([
          fetchWithAuth("/api/inventory?archived=true"),
          fetchWithAuth("/api/inventory?archived=false"),
          fetchWithAuth("/api/shopping"),
        ])

        // Build name list for autocomplete from both active + archived inventory
        const names: string[] = []
        if (activeRes.ok) {
          const activeItems = await activeRes.json()
          if (Array.isArray(activeItems)) {
            activeItems.forEach((i: any) => { if (i.name) names.push(i.name) })
          }
        }

        // Also include active shopping list items so typeahead covers items not yet in inventory
        if (shoppingRes.ok) {
          const shoppingItems = await shoppingRes.json()
          if (Array.isArray(shoppingItems)) {
            shoppingItems.forEach((i: any) => { if (i.name) names.push(i.name) })
          }
        }

        if (!archivedRes.ok) { setAllInventoryNames(names); return }
        const archived = await archivedRes.json()
        if (!Array.isArray(archived)) { setAllInventoryNames(names); return }

        archived.forEach((i: any) => { if (i.name) names.push(i.name) })
        setAllInventoryNames(names)

        const consumed = archived
          .filter((item: any) => item.archiveReason === "consumed")
          .slice(0, 5)

        const seen = new Set<string>()
        const suggestions = consumed
          .filter((item: any) => {
            const key = item.name.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((item: any) => ({
            name: item.name,
            category: item.category || "Other",
            expiryDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
            location: item.location || "Refrigerator",
            quantity: item.quantity || 1,
            price: item.price || "",
            reason: "Previously consumed - may need restocking",
          }))

        setSuggestedItems(suggestions)
      } catch {
        // ignore
      } finally {
        setSuggestionsLoading(false)
      }
    }
    loadSuggestions()
  }, [])

  const handleAddSuggestedItem = async (item: (typeof suggestedItems)[0]) => {
    setAddingSuggestedId(item.name)
    try {
      const { completedShoppingItems } = await addInventoryItem({
        name: item.name,
        category: item.category,
        expiryDate: new Date(item.expiryDate).toISOString(),
        location: item.location,
        quantity: item.quantity,
        price: item.price,
        addedOn: new Date().toISOString(),
      } as unknown as InventoryItem)
      toast({ title: "Item Added", description: `${item.name} has been added to your inventory.` })
      showShoppingMatchToast(completedShoppingItems)
      router.push("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add item"
      toastWithNudge({ title: "Add Failed", description: message, variant: "destructive" })
    } finally {
      setAddingSuggestedId(null)
    }
  }

  const includedCount = extractedItems.filter((i) => i.included).length
  const approvedCount = includedCount
  const pendingCount = 0
  const bulkApplyEnabled = true

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

      <Tabs defaultValue="scan" value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden">
        <TabsList className="grid grid-cols-3 mb-6 shrink-0">
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

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div ref={formContainerRef} className="flex-1 overflow-y-auto">
            {/* Unified Scan Tab */}
            <TabsContent value="scan">
              {/* Hidden inputs always mounted so refs stay non-null across all states */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageUpload}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              <div className="space-y-6">
                {!imagePreview && imagePreviews.length === 0 ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed rounded-xl p-8 text-center">
                      <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Smart Scan</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Take a photo to instantly extract items, or upload up to 5 photos — shelves, receipts, packaging, or order confirmation screenshots. AI detects everything automatically.
                      </p>

                      <div className="flex flex-col gap-3">
                        <Button type="button" size="lg" className="w-full" onClick={handleCameraCapture}>
                          <Camera className="mr-2 h-5 w-5" />
                          Take a Photo
                        </Button>

                        <div>
                          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleFileUpload}>
                            <ImageIcon className="mr-2 h-5 w-5" />
                            Upload Photos from Gallery
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1.5">Select up to 5 photos at once</p>
                        </div>
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
                ) : !imagePreview && imagePreviews.length > 0 ? (
                  /* Gallery preview strip — shown after selecting files, before Analyze */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">
                        {imagePreviews.length} image{imagePreviews.length !== 1 ? "s" : ""} selected
                      </h3>
                      <Button type="button" variant="ghost" size="icon" onClick={resetImageUpload}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear all</span>
                      </Button>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {imagePreviews.map((preview, index) => (
                        <div key={index} className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border">
                          <img
                            src={preview}
                            alt={`Image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                            onClick={() => removeSelectedFile(index)}
                            aria-label={`Remove image ${index + 1}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {imagePreviews.length < 5 && (
                        <button
                          type="button"
                          className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Plus className="h-5 w-5" />
                          <span className="text-[10px] mt-0.5 text-center leading-tight">
                            Add more<br />({5 - imagePreviews.length} left)
                          </span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      AI will detect and extract all unique items across your photos.
                    </p>

                    <Button type="button" className="w-full" onClick={handleAnalyze}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Analyze {imagePreviews.length} image{imagePreviews.length !== 1 ? "s" : ""}
                    </Button>
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

                    {imagePreviews.length > 1 ? (
                      /* Multi-image: show thumbnail strip */
                      <div className="flex gap-2 overflow-x-auto pb-1 bg-muted rounded-lg p-2">
                        {imagePreviews.map((preview, i) => (
                          <div key={i} className={`relative shrink-0 w-20 h-20 rounded overflow-hidden border ${isAnalyzing ? "animate-pulse" : ""}`}>
                            <img src={preview} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
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
                    )}

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
                        {scanError && <p className="text-sm text-destructive">{scanError}</p>}
                        {extractedItems.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium">
                                {includedCount} of {extractedItems.length} item{extractedItems.length !== 1 ? "s" : ""} selected
                              </h3>
                              {reviewSummary && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(reviewSummary.confidence * 100)}% confidence
                                </span>
                              )}
                            </div>

                            <div className="space-y-3">
                              {extractedItems.map((item, index) => (
                                <Card
                                  key={index}
                                  className={`border transition-all ${
                                    item.included
                                      ? "border-primary bg-primary/[0.02]"
                                      : "opacity-50 border-muted"
                                  }`}
                                >
                                  <CardContent className="p-3 space-y-3">
                                    {/* Row 1: checkbox + name + confidence */}
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={item.included}
                                        onChange={() => toggleItemIncluded(index)}
                                        className="h-4 w-4 rounded shrink-0 accent-primary"
                                        aria-label={`Include ${item.name}`}
                                      />
                                      <div className="flex-1 space-y-1">
                                        <Input
                                          value={item.name}
                                          onChange={(e) => updateExtractedItem(index, "name", e.target.value)}
                                          className="h-8 text-base md:text-sm font-medium"
                                          disabled={!item.included}
                                          placeholder="Item name"
                                        />
                                        <Input
                                          value={item.brand || ""}
                                          onChange={(e) => updateExtractedItem(index, "brand", e.target.value)}
                                          className="h-7 text-base md:text-xs text-muted-foreground"
                                          disabled={!item.included}
                                          placeholder="Brand (optional)"
                                        />
                                      </div>
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        {Math.round(item.confidence * 100)}%
                                      </Badge>
                                    </div>

                                    {/* Row 2: category + expiry date */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <Select
                                        value={item.category}
                                        onValueChange={(value) => updateExtractedItem(index, "category", value)}
                                        disabled={!item.included}
                                      >
                                        <SelectTrigger className="h-9 text-sm">
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
                                        onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                                        className="h-9 text-base md:text-sm"
                                        disabled={!item.included}
                                      />
                                    </div>

                                    {/* Row 3: quantity + unit */}
                                    <QuantityWithUnits
                                      value={item.quantity}
                                      unit={item.unit}
                                      onChange={(value, unit) => {
                                        updateExtractedItem(index, "quantity", value)
                                        updateExtractedItem(index, "unit", unit)
                                      }}
                                      min={0.1}
                                    />

                                    {/* Row 4: price */}
                                    <CurrencyInput
                                      compact
                                      value={item.price || ""}
                                      onValueChange={(val) => updateExtractedItem(index, "price", val)}
                                    />
                                  </CardContent>
                                </Card>
                              ))}
                            </div>

                            {/* Add item row for scan review */}
                            {scanAddingItem ? (
                              <div className="relative rounded-lg border p-3 bg-background space-y-2">
                                <Input
                                  value={scanNewItemName}
                                  placeholder="Item name…"
                                  className="h-8 text-base md:text-sm"
                                  autoFocus
                                  onChange={(e) => {
                                    setScanNewItemName(e.target.value)
                                    fetchScanItemSuggestions(e.target.value)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitScanNewItem(scanNewItemName)
                                    if (e.key === "Escape") { setScanAddingItem(false); setScanNewItemName(""); setScanNewItemSuggestions([]) }
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (!scanNewItemName.trim()) {
                                        setScanAddingItem(false)
                                        setScanNewItemSuggestions([])
                                      }
                                    }, 150)
                                  }}
                                />
                                {scanNewItemSuggestions.length > 0 && (
                                  <ul className="absolute left-3 right-3 bottom-full mb-1 z-50 rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
                                    {scanNewItemSuggestions.map((s) => (
                                      <li
                                        key={s}
                                        className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent"
                                        onMouseDown={() => commitScanNewItem(s)}
                                      >
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setScanAddingItem(false); setScanNewItemName(""); setScanNewItemSuggestions([]) }}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => commitScanNewItem(scanNewItemName)} disabled={!scanNewItemName.trim()}>
                                    Add
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => { setScanAddingItem(true); setScanNewItemName("") }}
                              >
                                <Plus className="h-4 w-4" />
                                Add item
                              </button>
                            )}

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
                  <div className="relative">
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleNameInputChange}
                      onFocus={() => formData.name && setShowNameSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                      onKeyDown={(e) => { if (e.key === "Escape") setShowNameSuggestions(false) }}
                      required
                      autoFocus={false}
                      autoComplete="off"
                    />
                    {showNameSuggestions && nameSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg overflow-hidden">
                        {nameSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setFormData((prev) => ({ ...prev, name: suggestion }))
                              setNameSuggestions([])
                              setShowNameSuggestions(false)
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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

                <QuantityWithUnits
                  id="quantity"
                  label="Quantity"
                  value={formData.quantity}
                  unit={formData.unit}
                  onChange={(value, unit) => setFormData((prev) => ({ ...prev, quantity: value, unit }))}
                />

                <CurrencyInput
                  id="price"
                  label="Price"
                  value={formData.price}
                  currency={formData.currency}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, price: val }))}
                  onCurrencyChange={(cur) => setFormData((prev) => ({ ...prev, currency: cur }))}
                />

                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={handleInputChange}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
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

                {suggestionsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
                        <div className="h-4 w-1/2 rounded bg-muted" />
                        <div className="h-3 w-3/4 rounded bg-muted" />
                        <div className="flex gap-2 mt-2">
                          <div className="h-6 w-16 rounded bg-muted" />
                          <div className="h-6 w-12 rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : suggestedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No suggestions yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1 max-w-[220px]">
                      Add items and mark them as consumed to get personalised restock suggestions here.
                    </p>
                  </div>
                ) : (
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
                          <LoadingButton
                            type="button"
                            size="sm"
                            onClick={() => handleAddSuggestedItem(item)}
                            isLoading={addingSuggestedId === item.name}
                            disabled={addingSuggestedId === item.name}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add to Inventory
                          </LoadingButton>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>

          <div className="shrink-0 bg-background border-t px-4 pt-4 pb-6">
            <div className="max-w-md mx-auto">
              <LoadingButton
                type="submit"
                className="w-full"
                isLoading={isSaving}
                disabled={
                  (activeTab === "scan" &&
                    (isAnalyzing || (!imagePreview && imagePreviews.length === 0) || includedCount === 0)) ||
                  (activeTab === "manual" &&
                    (!formData.name || !formData.category || !formData.expiryDate || !formData.location)) ||
                  activeTab === "suggested"
                }
              >
                {activeTab === "scan"
                  ? `Save${includedCount > 0 ? ` (${includedCount} item${includedCount > 1 ? "s" : ""})` : ""}`
                  : "Save Item"}
              </LoadingButton>
            </div>
          </div>
        </form>
      </Tabs>

      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />
    </MainLayout>
  )
}
