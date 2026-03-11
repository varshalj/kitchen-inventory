"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Link2, Loader2, Clipboard, AlertCircle, ChefHat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import { startRecipeImport, pollRecipeImport } from "@/lib/client/api"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import type { ParsedRecipe, PantryMatch } from "@/lib/types"

interface RecipeImportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecipeReady: (data: {
    importId: string
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  }) => void
}

type ImportPhase = "input" | "importing" | "error"

const STATUS_LABELS: Record<string, string> = {
  pending: "Starting import…",
  extracting: "Fetching recipe page…",
  parsing: "Extracting recipe with AI…",
  ready: "Recipe ready!",
  failed: "Import failed",
}

export function RecipeImportSheet({ open, onOpenChange, onRecipeReady }: RecipeImportSheetProps) {
  const { toast } = useToast()
  const [url, setUrl] = useState("")
  const [phase, setPhase] = useState<ImportPhase>("input")
  const [importStatus, setImportStatus] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      cleanup()
      setPhase("input")
      setUrl("")
      setImportStatus("")
      setErrorMessage("")
    }
    return cleanup
  }, [open, cleanup])

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.startsWith("http")) {
        setUrl(text)
      }
    } catch {
      // Clipboard not available
    }
  }

  const handleImport = async () => {
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

    try {
      const result = await startRecipeImport(trimmed)

      if (result.duplicate) {
        triggerHaptic(HAPTIC_ERROR)
        toast({
          title: "Already imported",
          description: result.message || "This recipe has already been imported.",
          variant: "destructive",
        })
        setPhase("input")
        return
      }

      const importId = result.importId

      // Start polling
      let attempts = 0
      const maxAttempts = 30 // 30 * 2s = 60s max

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
          // Network blip — keep polling
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Import Recipe
          </SheetTitle>
          <SheetDescription>
            Paste a recipe blog URL to import ingredients and steps
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4 space-y-4">
          {/* Input phase */}
          {phase === "input" && (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleImport()}
                    placeholder="https://example.com/recipe"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button variant="outline" size="icon" onClick={handlePaste} title="Paste from clipboard">
                  <Clipboard className="h-4 w-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={handleImport}
                disabled={!url.trim()}
              >
                Import Recipe
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Supports most recipe blogs. YouTube support coming soon.
              </p>
            </>
          )}

          {/* Importing phase */}
          {phase === "importing" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="relative">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {STATUS_LABELS[importStatus] || "Processing…"}
                </p>
                <p className="text-xs text-muted-foreground max-w-[250px] truncate">
                  {url}
                </p>
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
              <Button variant="outline" onClick={() => setPhase("input")}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
