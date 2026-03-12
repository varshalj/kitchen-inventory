"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChefHat,
  Plus,
  RefreshCw,
  Clock,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MainLayout } from "@/components/main-layout"
import { RecipeImportSheet } from "@/components/recipe-import-sheet"
import { RecipeReviewScreen } from "@/components/recipe-review-screen"
import { getRecipes, recalculateRecipeScores } from "@/lib/client/api"
import { useToast } from "@/hooks/use-toast"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { Recipe, ParsedRecipe, PantryMatch } from "@/lib/types"

type SortOption = "score" | "newest" | "az"

const STALE_DAYS = 7

function isScoreStale(lastChecked?: string): boolean {
  if (!lastChecked) return false
  const diff = Date.now() - new Date(lastChecked).getTime()
  return diff > STALE_DAYS * 24 * 60 * 60 * 1000
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) {
    return (
      <span className="text-xs text-muted-foreground">No score</span>
    )
  }
  const color =
    score >= 70
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 40
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200"
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", color)}>
      {score}% ready
    </span>
  )
}

function PlatformChip({ platform }: { platform?: string }) {
  if (!platform) return null
  const label = platform === "youtube" ? "YouTube" : platform.charAt(0).toUpperCase() + platform.slice(1)
  return (
    <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground border px-2 py-0.5 text-xs">
      {label}
    </span>
  )
}

function TimeDisplay({ prep, cook }: { prep?: number; cook?: number }) {
  const total = (prep ?? 0) + (cook ?? 0)
  if (!total) return null
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {total} min
    </span>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{recipe.title}</h3>
          <ScoreBadge score={recipe.pantryCompatibilityScore} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TimeDisplay prep={recipe.prepTimeMinutes} cook={recipe.cookTimeMinutes} />
          <PlatformChip platform={recipe.sourcePlatform} />
        </div>
      </div>
    </Link>
  )
}

function sortRecipes(recipes: Recipe[], sort: SortOption): Recipe[] {
  const copy = [...recipes]
  if (sort === "score") {
    return copy.sort((a, b) => (b.pantryCompatibilityScore ?? -1) - (a.pantryCompatibilityScore ?? -1))
  }
  if (sort === "newest") {
    return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  if (sort === "az") {
    return copy.sort((a, b) => a.title.localeCompare(b.title))
  }
  return copy
}

export function RecipesList() {
  const { toast } = useToast()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sort, setSort] = useState<SortOption>("score")
  const [showImport, setShowImport] = useState(false)
  const [recipeReviewData, setRecipeReviewData] = useState<{
    importId: string
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  } | null>(null)

  const loadRecipes = useCallback(async () => {
    try {
      const data = await getRecipes()
      setRecipes(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to load recipes:", err)
      toast({ title: "Failed to load recipes", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadRecipes()
  }, [loadRecipes])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    triggerHaptic([30])
    try {
      const result = await recalculateRecipeScores()
      toast({
        title: "Pantry matches updated",
        description: `${result.updated} recipe${result.updated !== 1 ? "s" : ""} refreshed`,
      })
      triggerHaptic(HAPTIC_SUCCESS)
      await loadRecipes()
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" })
      triggerHaptic(HAPTIC_ERROR)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleRecipeReady = (data: {
    importId: string
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  }) => {
    setShowImport(false)
    setRecipeReviewData(data)
  }

  const handleReviewSaved = () => {
    setRecipeReviewData(null)
    loadRecipes()
  }

  const handleReviewBack = () => {
    setRecipeReviewData(null)
    setShowImport(true)
  }

  const sortedRecipes = sortRecipes(recipes, sort)

  const anyStale = recipes.some((r) => isScoreStale(r.pantryLastChecked))

  const sortLabels: Record<SortOption, string> = {
    score: "Best match",
    newest: "Newest",
    az: "A–Z",
  }

  if (recipeReviewData) {
    return (
      <RecipeReviewScreen
        {...recipeReviewData}
        onBack={handleReviewBack}
        onSaved={handleReviewSaved}
      />
    )
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleRefresh}
            disabled={isRefreshing || recipes.length === 0}
            title="Refresh pantry matches"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => setShowImport(true)}
          >
            <Plus className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      {/* Staleness nudge banner */}
      {anyStale && !isLoading && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-amber-800 flex-1">
            Your pantry may have changed — tap{" "}
            <button
              onClick={handleRefresh}
              className="font-semibold underline underline-offset-2"
              disabled={isRefreshing}
            >
              Refresh
            </button>{" "}
            to update recipe matches
          </span>
        </div>
      )}

      {/* Sort control (only if recipes exist) */}
      {!isLoading && recipes.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {(["score", "newest", "az"] as SortOption[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setSort(opt)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                sort === opt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {sortLabels[opt]}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
              <div className="flex justify-between mb-2">
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && recipes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <ChefHat className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-1 text-lg font-semibold">No recipes yet</h2>
          <p className="mb-6 text-sm text-muted-foreground max-w-xs">
            Import a recipe from a cooking blog or YouTube video and see which ones you can cook with what's in your pantry.
          </p>
          <Button onClick={() => setShowImport(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Import your first recipe
          </Button>
        </div>
      )}

      {/* Recipe list */}
      {!isLoading && sortedRecipes.length > 0 && (
        <div className="space-y-3">
          {sortedRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {/* Import sheet */}
      <RecipeImportSheet
        open={showImport}
        onOpenChange={setShowImport}
        onRecipeReady={handleRecipeReady}
      />
    </MainLayout>
  )
}
