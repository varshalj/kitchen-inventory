"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Mic, MicOff, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { QuantityWithUnits } from "@/components/quantity-with-units"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"

export interface VoiceParsedItem {
  name: string
  quantity: number
  unit: string
  category?: string
  included: boolean
}

interface VoiceCaptureProps {
  target: "shopping" | "inventory"
  /** Called when user confirms the parsed items */
  onConfirm: (items: VoiceParsedItem[]) => Promise<void>
  /** Names already in the list, used for duplicate badges */
  existingNames?: string[]
}

type Phase = "idle" | "listening" | "parsing" | "review"

export function VoiceCapture({ target, onConfirm, existingNames = [] }: VoiceCaptureProps) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsedItems, setParsedItems] = useState<VoiceParsedItem[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    supported,
    state: speechState,
    transcript,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({ lang: "en-IN" })

  const existingSet = new Set(existingNames.map((n) => n.toLowerCase()))

  const transcriptRef = useRef(transcript)
  const interimRef = useRef(interimTranscript)
  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { interimRef.current = interimTranscript }, [interimTranscript])

  const handleOpen = () => {
    setOpen(true)
    setPhase("idle")
    setParsedItems([])
    setParseError(null)
  }

  const handleStartListening = () => {
    setPhase("listening")
    setParseError(null)
    startListening()
  }

  const handleStopAndParse = useCallback(async () => {
    stopListening()

    // Wait for the final transcript to settle after recognition ends
    await new Promise((r) => setTimeout(r, 400))

    const finalTranscript = transcriptRef.current || interimRef.current
    if (!finalTranscript.trim()) {
      setParseError("No speech detected. Tap the mic and try again.")
      setPhase("idle")
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
      const items: VoiceParsedItem[] = (data.items || []).map((item: any) => ({
        name: item.name || "Unknown",
        quantity: item.quantity || 1,
        unit: item.unit || "pcs",
        category: item.category,
        included: true,
      }))

      if (items.length === 0) {
        setParseError("Could not detect any items. Please try again.")
        setPhase("idle")
        return
      }

      setParsedItems(items)
      setPhase("review")
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse voice input")
      setPhase("idle")
    }
  }, [stopListening, target])

  const toggleItem = (index: number) => {
    setParsedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, included: !item.included } : item))
    )
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    setParsedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value, included: true } : item))
    )
  }

  const includedCount = parsedItems.filter((i) => i.included).length

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(parsedItems.filter((i) => i.included))
      setOpen(false)
      setPhase("idle")
      setParsedItems([])
    } catch {
      setParseError("Failed to save items. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!supported) {
    return (
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Voice Add</SheetTitle>
            <SheetDescription>
              Speak your items naturally, e.g. "milk, eggs and two kilos potatoes"
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-4">
            {/* Listening / idle state */}
            {(phase === "idle" || phase === "listening") && (
              <div className="flex flex-col items-center py-6 gap-4">
                <button
                  type="button"
                  onClick={phase === "listening" ? handleStopAndParse : handleStartListening}
                  className={cn(
                    "h-20 w-20 rounded-full flex items-center justify-center transition-all",
                    phase === "listening"
                      ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                  aria-label={phase === "listening" ? "Stop recording" : "Start recording"}
                >
                  {phase === "listening" ? (
                    <Mic className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </button>

                <p className="text-sm text-muted-foreground text-center">
                  {phase === "listening"
                    ? "Listening... Tap to stop"
                    : "Tap the mic and speak your items"}
                </p>

                {/* Live transcript preview */}
                {phase === "listening" && (transcript || interimTranscript) && (
                  <div className="w-full rounded-lg bg-muted/50 p-3 text-sm text-center min-h-[3rem]">
                    {transcript && <span>{transcript} </span>}
                    {interimTranscript && (
                      <span className="text-muted-foreground italic">{interimTranscript}</span>
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
                <p className="text-sm text-muted-foreground">Parsing your items...</p>
                {transcript && (
                  <p className="text-xs text-muted-foreground/70 text-center max-w-[280px]">
                    &ldquo;{transcript}&rdquo;
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
                  const isDuplicate = existingSet.has(item.name.toLowerCase())
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-all",
                        item.included ? "bg-background" : "opacity-50 bg-muted/30"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={() => toggleItem(index)}
                        className="h-4 w-4 rounded mt-1 shrink-0 accent-primary"
                        aria-label={`Include ${item.name}`}
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(index, "name", e.target.value)}
                            className="h-8 text-sm font-medium"
                            disabled={!item.included}
                          />
                          {isDuplicate && (
                            <span className="text-xs text-amber-600 font-medium shrink-0 whitespace-nowrap">
                              In list
                            </span>
                          )}
                        </div>
                        <QuantityWithUnits
                          value={item.quantity}
                          unit={item.unit}
                          onChange={(val, unit) => {
                            updateItem(index, "quantity", val)
                            updateItem(index, "unit", unit)
                          }}
                          min={0.1}
                        />
                      </div>
                    </div>
                  )
                })}

                {parseError && (
                  <p className="text-sm text-destructive text-center">{parseError}</p>
                )}
              </div>
            )}
          </div>

          {phase === "review" && (
            <SheetFooter>
              <Button
                className="w-full"
                onClick={handleConfirm}
                disabled={includedCount === 0 || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add {includedCount} item{includedCount !== 1 ? "s" : ""} to list
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
