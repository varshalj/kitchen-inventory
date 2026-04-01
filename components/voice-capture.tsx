"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Mic, MicOff, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { QuantityWithUnits } from "@/components/quantity-with-units"
import { CurrencyInput } from "@/components/currency-input"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { fetchWithAuth } from "@/lib/api-client"
import { suggestInventoryItems } from "@/lib/client/api"
import { useUserSettings } from "@/hooks/use-user-settings"
import { cn, findFuzzyMatch } from "@/lib/utils"

const MAX_DURATION_MS = 30000

import { CATEGORIES, DEFAULT_EXPIRY_DAYS, defaultExpiryDate } from "@/lib/constants"

function normaliseQuantity(qty: number, unit: string): { quantity: number; unit: string } {
  if (unit === "kg" && qty > 0 && qty < 1) {
    return { quantity: Math.round(qty * 1000), unit: "g" }
  }
  if (unit === "l" && qty > 0 && qty < 1) {
    return { quantity: Math.round(qty * 1000), unit: "ml" }
  }
  return { quantity: parseFloat(qty.toFixed(2)), unit }
}

export interface VoiceParsedItem {
  name: string
  quantity: number
  unit: string
  category?: string
  expiryDate?: string
  brand?: string
  price?: string
  location?: string
  included: boolean
  fuzzyMatchedName?: string
}

interface VoiceCaptureProps {
  target: "shopping" | "inventory"
  onConfirm: (items: VoiceParsedItem[], globals?: { location?: string; notes?: string }) => Promise<void>
  existingNames?: string[]
  fullWidth?: boolean
}

type Phase = "idle" | "listening" | "parsing" | "review"

export function VoiceCapture({ target, onConfirm, existingNames = [], fullWidth }: VoiceCaptureProps) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsedItems, setParsedItems] = useState<VoiceParsedItem[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [addingNewItem, setAddingNewItem] = useState(false)
  const [newItemName, setNewItemName] = useState("")
  const [newItemSuggestions, setNewItemSuggestions] = useState<string[]>([])
  const newItemInputRef = useRef<HTMLInputElement>(null)
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [globalLocation, setGlobalLocation] = useState("Refrigerator")
  const [globalNotes, setGlobalNotes] = useState("")

  const { settings } = useUserSettings()
  const isInventory = target === "inventory"

  const {
    supported,
    state: speechState,
    transcript,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({ lang: "en-IN", maxDuration: MAX_DURATION_MS })

  const transcriptRef = useRef(transcript)
  const interimRef = useRef(interimTranscript)
  const existingNamesRef = useRef(existingNames)
  const isParsingRef = useRef(false)
  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { interimRef.current = interimTranscript }, [interimTranscript])
  useEffect(() => { existingNamesRef.current = existingNames }, [existingNames])

  useEffect(() => {
    if (phase !== "listening") {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => setElapsed((e) => e + 100), 100)
    return () => clearInterval(interval)
  }, [phase])

  const handleOpen = () => {
    setOpen(true)
    setPhase("idle")
    setParsedItems([])
    setParseError(null)
    setGlobalLocation("Refrigerator")
    setGlobalNotes("")
    isParsingRef.current = false
  }

  const handleStartListening = () => {
    setPhase("listening")
    setParseError(null)
    isParsingRef.current = false
    startListening()
  }

  const handleStopAndParse = useCallback(async () => {
    if (isParsingRef.current) return
    isParsingRef.current = true

    stopListening()
    await new Promise((r) => setTimeout(r, 400))

    const finalTranscript = transcriptRef.current || interimRef.current
    if (!finalTranscript.trim()) {
      setParseError("Didn't catch anything. Tap the mic and try again.")
      setPhase("idle")
      isParsingRef.current = false
      return
    }

    setPhase("parsing")

    try {
      const response = await fetchWithAuth("/api/ai/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: finalTranscript, target, lang: "en-IN" }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || "Failed to parse voice input")
      }

      const data = await response.json()
      const items: VoiceParsedItem[] = (data.items || []).map((item: any) => {
        const name = item.name || "Unknown"
        const fuzzyMatch = findFuzzyMatch(name, existingNamesRef.current)
        const category = item.category || "Other"
        const { quantity, unit } = normaliseQuantity(item.quantity || 1, item.unit || "pcs")
        return {
          name,
          quantity,
          unit,
          category,
          expiryDate: target === "inventory" ? defaultExpiryDate(category) : undefined,
          brand: "",
          price: "",
          location: globalLocation,
          included: fuzzyMatch === null,
          fuzzyMatchedName: fuzzyMatch ?? undefined,
        }
      })

      if (items.length === 0) {
        setParseError("Could not detect any items. Please try again.")
        setPhase("idle")
        isParsingRef.current = false
        return
      }

      setParsedItems(items)
      setPhase("review")
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setPhase("idle")
      isParsingRef.current = false
    }
  }, [stopListening, target])

  useEffect(() => {
    if (speechState === "idle" && phase === "listening") {
      void handleStopAndParse()
    }
  }, [speechState, phase, handleStopAndParse])

  const toggleItem = (index: number) => {
    setParsedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, included: !item.included } : item))
    )
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    setParsedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value, included: true }
        if (field === "category" && isInventory) {
          updated.expiryDate = defaultExpiryDate(value as string)
        }
        return updated
      })
    )
  }

  const fetchNewItemSuggestions = (query: string) => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (query.length < 2) {
      setNewItemSuggestions([])
      return
    }
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const results = await suggestInventoryItems(query)
        setNewItemSuggestions(results)
      } catch {
        setNewItemSuggestions([])
      }
    }, 300)
  }

  const commitNewItem = (name: string) => {
    const trimmed = name.trim()
    if (trimmed) {
      setParsedItems((prev) => [
        ...prev,
        {
          name: trimmed,
          quantity: 1,
          unit: "pcs",
          category: "Other",
          expiryDate: isInventory ? defaultExpiryDate("Other") : undefined,
          brand: "",
          price: "",
          included: true,
        },
      ])
    }
    setAddingNewItem(false)
    setNewItemName("")
    setNewItemSuggestions([])
  }

  const includedCount = parsedItems.filter((i) => i.included).length

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const globals = isInventory ? { location: globalLocation, notes: globalNotes } : undefined
      await onConfirm(parsedItems.filter((i) => i.included), globals)
      setOpen(false)
      setPhase("idle")
      setParsedItems([])
    } catch {
      setParseError("Failed to save items. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const radius = 44
  const circumference = 2 * Math.PI * radius
  const ringProgress = Math.min(elapsed / MAX_DURATION_MS, 1)
  const strokeDashoffset = circumference * ringProgress

  const elapsedSec = Math.floor(elapsed / 1000)
  const elapsedLabel = `0:${String(elapsedSec).padStart(2, "0")}`

  if (!supported) {
    return fullWidth ? (
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 justify-start gap-3 opacity-50 cursor-not-allowed"
        disabled
      >
        <MicOff className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">Add items by voice</span>
        <span className="ml-auto text-xs text-muted-foreground">Not supported</span>
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 opacity-50 cursor-not-allowed"
        disabled
        title="Voice input not supported in this browser"
      >
        <MicOff className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <>
      {fullWidth ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 justify-start gap-3"
          onClick={handleOpen}
        >
          <Mic className="h-5 w-5 text-primary" />
          <span className="font-medium">Add items by voice</span>
          <span className="ml-auto text-xs text-muted-foreground">Tap to start</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleOpen}
          title="Add items by voice"
        >
          <Mic className="h-4 w-4" />
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <div className="flex-1 min-h-0 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Voice Add</SheetTitle>
            <SheetDescription>
              Speak your items naturally — e.g. &ldquo;milk, eggs and two kilos of potatoes&rdquo;
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-4">
            {/* Listening / idle state */}
            {(phase === "idle" || phase === "listening") && (
              <div className="flex flex-col items-center py-6 gap-4">
                <div className="relative h-24 w-24 flex items-center justify-center">
                  {phase === "listening" && (
                    <svg
                      className="absolute inset-0 w-full h-full -rotate-90"
                      viewBox="0 0 100 100"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="text-red-300 transition-none"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  <button
                    type="button"
                    onClick={phase === "listening" ? handleStopAndParse : handleStartListening}
                    className={cn(
                      "h-20 w-20 rounded-full flex items-center justify-center transition-all z-10",
                      phase === "listening"
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                        : "bg-muted hover:bg-muted/80 text-foreground"
                    )}
                    aria-label={phase === "listening" ? "Stop recording" : "Start recording"}
                  >
                    <Mic className="h-8 w-8" />
                  </button>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">
                    {phase === "listening" ? "Go ahead, I'm listening…" : "Tap the mic and say your items"}
                  </p>
                  {phase === "listening" ? (
                    <p className="text-xs text-muted-foreground">
                      Pause when done &nbsp;·&nbsp; {elapsedLabel}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Hindi, English or mixed — all work
                    </p>
                  )}
                </div>

                {phase === "listening" && (
                  <div className="w-full rounded-lg bg-muted/50 border border-border p-3 text-sm text-center min-h-[3rem] flex items-center justify-center">
                    {transcript || interimTranscript ? (
                      <>
                        {transcript && <span>{transcript} </span>}
                        {interimTranscript && (
                          <span className="text-muted-foreground italic">{interimTranscript}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground/50 italic text-xs">
                        Your words will appear here…
                      </span>
                    )}
                  </div>
                )}

                {(parseError || speechError) && (
                  <p className="text-sm text-destructive text-center">
                    {parseError || speechError}
                  </p>
                )}
              </div>
            )}

            {/* Parsing state */}
            {phase === "parsing" && (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Working out your items…</p>
                {transcriptRef.current && (
                  <p className="text-xs text-muted-foreground/70 text-center max-w-[280px]">
                    &ldquo;{transcriptRef.current}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Review state */}
            {phase === "review" && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {includedCount} of {parsedItems.length} item{parsedItems.length !== 1 ? "s" : ""} selected
                </p>

                {parsedItems.map((item, index) => {
                  const matchedName = item.fuzzyMatchedName
                  return (
                    <div
                      key={index}
                      className={cn(
                        "rounded-lg border p-3 transition-all space-y-2",
                        item.included ? "bg-background" : "opacity-60 bg-muted/30",
                        matchedName && !item.included ? "border-amber-300" : ""
                      )}
                    >
                      {matchedName && (
                        <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
                          <p className="text-xs text-amber-700">
                            Similar to <span className="font-semibold">{matchedName}</span> already in list
                          </p>
                          <button
                            type="button"
                            className="text-xs text-amber-700 underline ml-2 shrink-0"
                            onClick={() => toggleItem(index)}
                          >
                            {item.included ? "Undo" : "Add anyway"}
                          </button>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.included}
                          onChange={() => toggleItem(index)}
                          className="h-4 w-4 rounded mt-1 shrink-0 accent-primary"
                          aria-label={`Include ${item.name}`}
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(index, "name", e.target.value)}
                            className="h-8 text-sm font-medium"
                            placeholder="Item name"
                            disabled={!item.included}
                          />

                          {isInventory && (
                            <Input
                              value={item.brand || ""}
                              onChange={(e) => updateItem(index, "brand", e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Brand (optional)"
                              disabled={!item.included}
                            />
                          )}

                          {isInventory && (
                            <div className="grid grid-cols-2 gap-2">
                              <Select
                                value={item.category || "Other"}
                                onValueChange={(v) => updateItem(index, "category", v)}
                                disabled={!item.included}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="date"
                                value={item.expiryDate || ""}
                                onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                                className="h-8 text-sm"
                                disabled={!item.included}
                              />
                            </div>
                          )}

                          {isInventory && (
                            <Select
                              value={item.location || globalLocation}
                              onValueChange={(v) => updateItem(index, "location", v)}
                              disabled={!item.included}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Storage location" />
                              </SelectTrigger>
                              <SelectContent>
                                {(settings?.storageLocations || ["Refrigerator", "Freezer", "Cabinet", "Counter"]).map((loc) => (
                                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          <QuantityWithUnits
                            value={item.quantity}
                            unit={item.unit}
                            onChange={(val, unit) => {
                              updateItem(index, "quantity", val)
                              updateItem(index, "unit", unit)
                            }}
                            min={0.1}
                          />

                          {isInventory && (
                          <CurrencyInput
                            value={item.price || ""}
                            onValueChange={(v) => updateItem(index, "price", v)}
                            placeholder="Price (optional)"
                            compact
                          />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Add item row */}
                {addingNewItem ? (
                  <div className="relative rounded-lg border p-3 bg-background space-y-1">
                    <Input
                      ref={newItemInputRef}
                      value={newItemName}
                      placeholder="Item name…"
                      className="h-8 text-sm"
                      onChange={(e) => {
                        setNewItemName(e.target.value)
                        fetchNewItemSuggestions(e.target.value)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitNewItem(newItemName)
                        if (e.key === "Escape") { setAddingNewItem(false); setNewItemName(""); setNewItemSuggestions([]) }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!newItemName.trim()) {
                            setAddingNewItem(false)
                            setNewItemSuggestions([])
                          }
                        }, 150)
                      }}
                      autoFocus
                    />
                    {newItemSuggestions.length > 0 && (
                      <ul className="absolute left-3 right-3 bottom-full mb-1 z-50 rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
                        {newItemSuggestions.map((s) => (
                          <li
                            key={s}
                            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent"
                            onMouseDown={() => commitNewItem(s)}
                          >
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingNewItem(false); setNewItemName(""); setNewItemSuggestions([]) }}>
                        <X className="h-3 w-3 mr-1" />Cancel
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => commitNewItem(newItemName)} disabled={!newItemName.trim()}>
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setAddingNewItem(true); setNewItemName("") }}
                  >
                    <Plus className="h-4 w-4" />
                    Add item
                  </button>
                )}

                {/* Global fields for inventory */}
                {isInventory && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <Label className="text-sm">Storage Location</Label>
                      <Select value={globalLocation} onValueChange={setGlobalLocation}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(settings?.storageLocations || ["Refrigerator", "Freezer", "Cabinet", "Counter"]).map((loc) => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Notes (optional)</Label>
                      <Textarea
                        value={globalNotes}
                        onChange={(e) => setGlobalNotes(e.target.value)}
                        placeholder="Any notes for these items…"
                        className="mt-1 text-sm resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {parseError && (
                  <p className="text-sm text-destructive text-center">{parseError}</p>
                )}
              </div>
            )}
          </div>
          </div>

          {phase === "review" && (
            <SheetFooter>
              <LoadingButton
                className="w-full"
                onClick={handleConfirm}
                disabled={includedCount === 0 || saving}
                isLoading={saving}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add {includedCount} item{includedCount !== 1 ? "s" : ""} to {isInventory ? "inventory" : "list"}
              </LoadingButton>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
