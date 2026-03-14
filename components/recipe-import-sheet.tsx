"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Link2,
  Loader2,
  Clipboard,
  AlertCircle,
  ChefHat,
  FileText,
  ArrowLeft,
  Clock,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import { startRecipeImport, pollRecipeImport, parseRecipeText, saveRecipeBookmark } from "@/lib/client/api"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import type { ParsedRecipe, PantryMatch } from "@/lib/types"

interface RecipeImportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecipeReady: (data: {
    importId: string | undefined
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  }) => void
  onGoHome?: () => void
  onBookmarkSaved?: () => void
}

type ImportPhase = "choose" | "url-input" | "text-input" | "importing" | "text-parsing" | "error"

const PROGRESS_STEPS = [
  "Getting things ready",
  "Looking at the recipe",
  "Organizing ingredients",
  "Checking the steps",
  "Almost there",
]
const STEP_DELAYS = [0, 5000, 15000, 25000, 35000]

export function RecipeImportSheet({ open, onOpenChange, onRecipeReady, onGoHome, onBookmarkSaved }: RecipeImportSheetProps) {
  const { toast } = useToast()
  const [url, setUrl] = useState("")
  const [pasteText, setPasteText] = useState("")
  const [phase, setPhase] = useState<ImportPhase>("choose")
  const [importStatus, setImportStatus] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [activeStep, setActiveStep] = useState(0)
  const [showBookmarkForm, setShowBookmarkForm] = useState(false)
  const [bookmarkTitle, setBookmarkTitle] = useState("")
  const [bookmarkNotes, setBookmarkNotes] = useState("")
  const [isSavingBookmark, setIsSavingBookmark] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []
  }, [])

  useEffect(() => {
    if (!open) {
      cleanup()
      setPhase("choose")
      setUrl("")
      setPasteText("")
      setImportStatus("")
      setErrorMessage("")
      setActiveStep(0)
      setShowBookmarkForm(false)
      setBookmarkTitle("")
      setBookmarkNotes("")
    }
    return cleanup
  }, [open, cleanup])

  const startProgressAnimation = () => {
    setActiveStep(0)
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []
    STEP_DELAYS.forEach((delay, i) => {
      if (i === 0) {
        setActiveStep(0)
      } else {
        const timer = setTimeout(() => setActiveStep(i), delay)
        progressTimersRef.current.push(timer)
      }
    })
  }

  const handlePasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.startsWith("http")) {
        setUrl(text)
      }
    } catch {
      // Clipboard not available
    }
  }

  const handleUrlImport = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    try {
      new URL(trimmed)
    } catch {
      setErrorMessage("Please enter a valid URL")
      setPhase("error")
      return
    }

    setPhase("importing")
    setImportStatus("pending")
    setErrorMessage("")
    startProgressAnimation()

    try {
      const result = await startRecipeImport(trimmed)

      if (result.duplicate) {
        triggerHaptic(HAPTIC_ERROR)
        toast({
          title: "Already imported",
          description: result.message || "This recipe has already been imported.",
          variant: "destructive",
        })
        setPhase("url-input")
        return
      }

      const importId = result.importId
      let attempts = 0
      const maxAttempts = 60

      pollRef.current = setInterval(async () => {
        attempts++

        try {
          const pollResult = await pollRecipeImport(importId)
          setImportStatus(pollResult.status)

          if (pollResult.status === "ready") {
            cleanup()
            triggerHaptic(HAPTIC_SUCCESS)
            onRecipeReady({
              importId,
              recipe: pollResult.recipe,
              pantryMatches: pollResult.pantryMatches || [],
              compatibilityScore: pollResult.compatibilityScore ?? 0,
              sourceUrl: pollResult.url || trimmed,
              sourcePlatform: pollResult.platform || "blog",
            })
            onOpenChange(false)
          } else if (pollResult.status === "failed") {
            cleanup()
            triggerHaptic(HAPTIC_ERROR)
            setErrorMessage(pollResult.errorMessage || "Could not extract a recipe from this URL.")
            setPhase("error")
          }
        } catch {
          // Network blip -- keep polling
        }

        if (attempts >= maxAttempts) {
          cleanup()
          setErrorMessage("Import timed out. Please try again.")
          setPhase("error")
        }
      }, 2000)
    } catch (err) {
      triggerHaptic(HAPTIC_ERROR)
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.")
      setPhase("error")
    }
  }

  const handleTextParse = async () => {
    const trimmed = pasteText.trim()
    if (!trimmed || trimmed.length < 20) {
      setErrorMessage("Please paste more recipe text (at least a few lines).")
      setPhase("error")
      return
    }

    setPhase("text-parsing")
    setErrorMessage("")

    try {
      const result = await parseRecipeText(trimmed)

      if (result.error) {
        triggerHaptic(HAPTIC_ERROR)
        setErrorMessage(result.error)
        setPhase("error")
        return
      }

      triggerHaptic(HAPTIC_SUCCESS)

      onRecipeReady({
        importId: undefined,
        recipe: result.recipe,
        pantryMatches: result.pantryMatches || [],
        compatibilityScore: result.compatibilityScore ?? 0,
        sourceUrl: "",
        sourcePlatform: "text",
      })
      onOpenChange(false)
    } catch (err) {
      triggerHaptic(HAPTIC_ERROR)
      setErrorMessage(err instanceof Error ? err.message : "Failed to parse recipe text.")
      setPhase("error")
    }
  }

  const handleGoHome = () => {
    onOpenChange(false)
    onGoHome?.()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            {(phase === "url-input" || phase === "text-input") && (
              <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setPhase("choose")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {phase === "choose" && <ChefHat className="h-5 w-5" />}
            {phase === "choose" ? "Import a recipe" : phase === "url-input" ? "Import from URL" : phase === "text-input" ? "Paste recipe text" : phase === "importing" ? "Importing your recipe" : phase === "text-parsing" ? "Parsing recipe" : "Import Recipe"}
          </SheetTitle>
          {phase === "choose" && (
            <SheetDescription>
              Choose how you want to add your recipe
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-3">
          {/* Choose phase */}
          {phase === "choose" && (
            <>
              <button
                onClick={() => setPhase("url-input")}
                className="w-full flex items-center gap-4 rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors active:scale-[0.99]"
              >
                <div className="shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Import recipe from URL</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We support Instagram, TikTok, YouTube, and recipe websites
                  </p>
                </div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0" />
              </button>

              <button
                onClick={() => setPhase("text-input")}
                className="w-full flex items-center gap-4 rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors active:scale-[0.99]"
              >
                <div className="shrink-0 h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Paste recipe text</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste the full recipe details here and AI will do the rest
                  </p>
                </div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0" />
              </button>
            </>
          )}

          {/* URL input phase */}
          {phase === "url-input" && (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
                    placeholder="https://example.com/recipe"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button variant="outline" size="icon" onClick={handlePasteUrl} title="Paste from clipboard">
                  <Clipboard className="h-4 w-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={handleUrlImport}
                disabled={!url.trim()}
              >
                Import Recipe
              </Button>
            </>
          )}

          {/* Text input phase */}
          {phase === "text-input" && (
            <div className="flex flex-col gap-3 h-full">
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the full recipe here — ingredients, steps, everything..."
                className="resize-none text-sm flex-1 min-h-[200px]"
                autoFocus
              />
              <Button
                className="w-full shrink-0"
                onClick={handleTextParse}
                disabled={pasteText.trim().length < 20}
              >
                <ChefHat className="h-4 w-4 mr-1" />
                Transform to Recipe
              </Button>
            </div>
          )}

          {/* Importing phase with animated progress */}
          {phase === "importing" && (
            <div className="py-4 space-y-5">
              <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className="shrink-0 h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Hang tight!</p>
                  <p className="text-xs text-muted-foreground">This takes about 1-2 minutes</p>
                </div>
              </div>

              <div className="space-y-3 px-1">
                {PROGRESS_STEPS.map((label, i) => {
                  const isComplete = i < activeStep
                  const isActive = i === activeStep
                  const isPending = i > activeStep
                  return (
                    <div key={label} className="flex items-center gap-3">
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted shrink-0" />
                      )}
                      <span className={`text-sm ${isComplete ? "text-green-600 font-medium" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="pt-4 space-y-2">
                <Button variant="outline" className="w-full" onClick={handleGoHome}>
                  Go to Recipes
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Don't worry, your recipe will keep importing
                </p>
              </div>
            </div>
          )}

          {/* Text parsing phase */}
          {phase === "text-parsing" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Extracting recipe with AI...</p>
                <p className="text-xs text-muted-foreground">This usually takes a few seconds</p>
              </div>
            </div>
          )}

          {/* Error phase */}
          {phase === "error" && (
            <div className="flex flex-col items-center py-6 gap-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm text-center text-destructive">{errorMessage}</p>
              <Button variant="outline" className="w-full" onClick={() => setPhase("choose")}>
                Try Again
              </Button>

              {!showBookmarkForm ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setBookmarkTitle(url ? new URL(url).hostname.replace("www.", "") : "")
                    setShowBookmarkForm(true)
                  }}
                >
                  Save as bookmark instead
                </button>
              ) : (
                <div className="w-full space-y-3 border rounded-xl p-4 bg-muted/30">
                  <p className="text-sm font-medium">Save as Bookmark</p>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Title</label>
                    <Input
                      value={bookmarkTitle}
                      onChange={(e) => setBookmarkTitle(e.target.value)}
                      placeholder="Recipe title or site name"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Notes (optional)</label>
                    <Textarea
                      value={bookmarkNotes}
                      onChange={(e) => setBookmarkNotes(e.target.value)}
                      placeholder="e.g. Good for weeknights, needs review later…"
                      className="resize-none text-sm"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowBookmarkForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!bookmarkTitle.trim() || isSavingBookmark}
                      onClick={async () => {
                        setIsSavingBookmark(true)
                        try {
                          await saveRecipeBookmark({
                            title: bookmarkTitle.trim(),
                            sourceUrl: url || undefined,
                            notes: bookmarkNotes.trim() || undefined,
                          })
                          toast({ title: "Bookmark saved", description: bookmarkTitle.trim() })
                          onBookmarkSaved?.()
                          onOpenChange(false)
                        } catch {
                          toast({ title: "Failed to save bookmark", variant: "destructive" })
                        } finally {
                          setIsSavingBookmark(false)
                        }
                      }}
                    >
                      {isSavingBookmark ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Bookmark"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
