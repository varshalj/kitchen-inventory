"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChefHat,
  Plus,
  RefreshCw,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  Search,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { MainLayout } from "@/components/main-layout"
import { RecipeImportSheet } from "@/components/recipe-import-sheet"
import { RecipeReviewScreen } from "@/components/recipe-review-screen"
import { getRecipes, recalculateRecipeScores, getPendingImports } from "@/lib/client/api"
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
  const labels: Record<string, string> = {
    youtube: "YouTube",
    instagram: "Instagram",
    twitter: "X / Twitter",
    tiktok: "TikTok",
    blog: "Blog",
  }
  const label = labels[platform] || platform.charAt(0).toUpperCase() + platform.slice(1)
  return (
    <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground border px-2 py-0.5 text-xs">
      {label}
    </span>
  )
}

function TimeDisplay({ prep, cook, total }: { prep?: number; cook?: number; total?: number }) {
  const computed = (prep ?? 0) + (cook ?? 0)
  const minutes = computed > 0 ? computed : (total ?? 0)
  if (!minutes) return null
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {minutes} min
    </span>
  )
}

function getYouTubeThumbnail(sourceUrl?: string): string | null {
  if (!sourceUrl) return null
  const match = sourceUrl.match(/[?&]v=([^&#]+)/) || sourceUrl.match(/youtu\.be\/([^?&#]+)/)
  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : null
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const thumbnail = recipe.imageUrl || (recipe.sourcePlatform === "youtube" ? getYouTubeThumbnail(recipe.sourceUrl) : null)
  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] overflow-hidden">
        {thumbnail && (
          <div className="aspect-video w-full overflow-hidden bg-muted">
            <img
              src={thumbnail}
              alt={recipe.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none"
              }}
            />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{recipe.title}</h3>
            <ScoreBadge score={recipe.pantryCompatibilityScore} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TimeDisplay prep={recipe.prepTimeMinutes} cook={recipe.cookTimeMinutes} total={recipe.totalTimeMinutes} />
            <PlatformChip platform={recipe.sourcePlatform} />
          </div>
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
  const [search, setSearch] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [recipeReviewData, setRecipeReviewData] = useState<{
    importId: string | undefined
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    sourceUrl: string
    sourcePlatform: string
  } | null>(null)
  const [pendingBanner, setPendingBanner] = useState<{
    importId: string
    recipe: ParsedRecipe
    pantryMatches: PantryMatch[]
    compatibilityScore: number
    url: string
    platform: string
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
    getPendingImports()
      .then((data) => {
        if (data.ready && data.ready.length > 0) {
          const item = data.ready[0]
          setPendingBanner({
            importId: item.importId,
            recipe: item.recipe,
            pantryMatches: item.pantryMatches || [],
            compatibilityScore: item.compatibilityScore ?? 0,
            url: item.url || "",
            platform: item.platform || "blog",
          })
        }
      })
      .catch(() => {})
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
    importId: string | undefined
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

  const sortedRecipes = sortRecipes(recipes, sort).filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  )

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

      {/* Resume banner for abandoned imports */}
      {pendingBanner && !recipeReviewData && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Your recipe is ready for review</p>
            <p className="text-xs text-muted-foreground truncate">{pendingBanner.recipe.title}</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setRecipeReviewData({
                importId: pendingBanner.importId,
                recipe: pendingBanner.recipe,
                pantryMatches: pendingBanner.pantryMatches,
                compatibilityScore: pendingBanner.compatibilityScore,
                sourceUrl: pendingBanner.url,
                sourcePlatform: pendingBanner.platform,
              })
              setPendingBanner(null)
            }}
          >
            Review
          </Button>
        </div>
      )}

      {/* Search input */}
      {!isLoading && recipes.length > 0 && (
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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

      {/* No search results */}
      {!isLoading && recipes.length > 0 && sortedRecipes.length === 0 && search && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No results for &ldquo;{search}&rdquo;
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
        onGoHome={() => setShowImport(false)}
      />
    </MainLayout>
  )
}
