"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  X,
  ShoppingCart,
  Clock,
  Users,
  ExternalLink,
  Loader2,
  ChefHat,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToastAction } from "@/components/ui/toast"
import { MainLayout } from "@/components/main-layout"
import { RecipeReviewScreen } from "@/components/recipe-review-screen"
import { useToast } from "@/hooks/use-toast"
import { getRecipeById, addToShoppingList, deleteRecipe } from "@/lib/client/api"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { Recipe, RecipeIngredient, ParsedRecipe, PantryMatch, PantryMatchStatus } from "@/lib/types"

const STATUS_CONFIG: Record<PantryMatchStatus, { label: string; color: string; icon: typeof Check }> = {
  available: { label: "In pantry", color: "bg-green-100 text-green-800 border-green-200", icon: Check },
  expiring: { label: "Expiring soon", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  expired: { label: "Expired", color: "bg-red-100 text-red-800 border-red-200", icon: X },
  missing: { label: "Missing", color: "bg-gray-100 text-gray-600 border-gray-200", icon: ShoppingCart },
}

interface RecipeDetailProps {
  id: string
}

interface IngredientWithMatch extends RecipeIngredient {
  pantryStatus: PantryMatchStatus
  pantryItemName?: string
  daysUntilExpiry?: number
}

function CompatibilityBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Pantry compatibility</span>
        <span className="font-semibold">{score}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

function IngredientRow({ ingredient }: { ingredient: IngredientWithMatch }) {
  const status = STATUS_CONFIG[ingredient.pantryStatus]
  const Icon = status.icon
  const quantityStr = ingredient.quantity != null
    ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
    : ""

  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className={cn("shrink-0 rounded-full p-1 border", status.color)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium leading-snug">
          {quantityStr ? `${quantityStr} ` : ""}{ingredient.canonicalName || ingredient.name}
          {ingredient.optional && (
            <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
          )}
        </span>
        {ingredient.preparation && (
          <p className="text-xs text-muted-foreground">{ingredient.preparation}</p>
        )}
        {ingredient.pantryStatus === "expiring" && ingredient.daysUntilExpiry != null && (
          <p className="text-xs text-amber-600">
            Expires in {ingredient.daysUntilExpiry} day{ingredient.daysUntilExpiry !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <span className={cn("shrink-0 text-xs rounded-full border px-2 py-0.5 font-medium", status.color)}>
        {status.label}
      </span>
    </div>
  )
}

function getYouTubeThumbnail(sourceUrl?: string): string | null {
  if (!sourceUrl) return null
  const match = sourceUrl.match(/[?&]v=([^&#]+)/) || sourceUrl.match(/youtu\.be\/([^?&#]+)/)
  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : null
}

function formatRecipeAsText(recipe: Recipe, ingredients: IngredientWithMatch[]): string {
  const prepTime = recipe.prepTimeMinutes ?? 0
  const cookTime = recipe.cookTimeMinutes ?? 0
  const totalTime = prepTime + cookTime || recipe.totalTimeMinutes
  const servingsStr = recipe.servings ? `Serves ${recipe.servings}` : ""
  const timeStr = totalTime ? `${totalTime} min` : ""
  const metaLine = [servingsStr, timeStr].filter(Boolean).join(" · ")

  const lines: string[] = [recipe.title]
  if (metaLine) lines.push(metaLine)
  lines.push("")

  if (ingredients.length > 0) {
    lines.push("INGREDIENTS")
    let lastGroup: string | null | undefined = undefined
    for (const ing of ingredients) {
      if (ing.ingredientGroup && ing.ingredientGroup !== lastGroup) {
        lines.push(`  ${ing.ingredientGroup}`)
        lastGroup = ing.ingredientGroup
      }
      const qty = ing.quantity != null ? `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}` : ""
      const name = ing.canonicalName || ing.name
      const prep = ing.preparation ? ` — ${ing.preparation}` : ""
      lines.push(`• ${qty ? qty + " " : ""}${name}${prep}`)
    }
    lines.push("")
  }

  if (recipe.instructions && recipe.instructions.length > 0) {
    lines.push("STEPS")
    recipe.instructions.forEach((rawStep, i) => {
      const step = typeof rawStep === "string" ? rawStep : (rawStep as any)?.step || (rawStep as any)?.text || JSON.stringify(rawStep)
      lines.push(`${i + 1}. ${step}`)
    })
    lines.push("")
  }

  if (recipe.sourceUrl) {
    lines.push(`Source: ${recipe.sourceUrl}`)
  }

  return lines.join("\n")
}

export function RecipeDetail({ id }: RecipeDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<IngredientWithMatch[]>([])
  const [compatibilityScore, setCompatibilityScore] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddingToList, setIsAddingToList] = useState(false)
  const [showGrocerySheet, setShowGrocerySheet] = useState(false)
  const [selectedGroceryItems, setSelectedGroceryItems] = useState<Set<number>>(new Set())
  const [isEditing, setIsEditing] = useState(false)

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false)

  const loadRecipe = useCallback(async () => {
    try {
      const data = await getRecipeById(id)
      setRecipe(data.recipe)
      setCompatibilityScore(data.compatibilityScore ?? 0)

      const pantryMatches: PantryMatch[] = data.pantryMatches ?? []
      const enriched: IngredientWithMatch[] = (data.ingredients ?? []).map(
        (ing: RecipeIngredient) => {
          const match = pantryMatches.find((m) => m.ingredientName === ing.name)
          return {
            ...ing,
            pantryStatus: match?.status ?? "missing",
            pantryItemName: match?.pantryItemName,
            daysUntilExpiry: match?.daysUntilExpiry,
          }
        },
      )
      setIngredients(enriched)
    } catch (err) {
      console.error("Failed to load recipe:", err)
      toast({ title: "Failed to load recipe", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    loadRecipe()
  }, [loadRecipe])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  const missingIngredients = ingredients.filter((i) => i.pantryStatus === "missing")

  const openGrocerySheet = () => {
    setSelectedGroceryItems(new Set())
    setShowGrocerySheet(true)
  }

  const toggleGroceryItem = (index: number) => {
    setSelectedGroceryItems((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const toggleAllGroceryItems = () => {
    if (selectedGroceryItems.size === missingIngredients.length) {
      setSelectedGroceryItems(new Set())
    } else {
      setSelectedGroceryItems(new Set(missingIngredients.map((_, i) => i)))
    }
  }

  const handleAddSelectedToList = async () => {
    if (selectedGroceryItems.size === 0) return
    setIsAddingToList(true)
    triggerHaptic([30])
    let addedCount = 0
    for (const idx of selectedGroceryItems) {
      const ing = missingIngredients[idx]
      if (!ing) continue
      try {
        await addToShoppingList({
          id: "",
          name: ing.canonicalName || ing.name,
          quantity: ing.quantity ?? 1,
          unit: ing.unit ?? "pcs",
          completed: false,
          addedOn: new Date().toISOString(),
          addedFrom: "manual",
        })
        addedCount++
      } catch {
        // continue adding others
      }
    }
    if (addedCount > 0) {
      triggerHaptic(HAPTIC_SUCCESS)
      toast({
        title: `${addedCount} item${addedCount !== 1 ? "s" : ""} added to shopping list`,
      })
    } else {
      triggerHaptic(HAPTIC_ERROR)
      toast({ title: "Failed to add items", variant: "destructive" })
    }
    setIsAddingToList(false)
    setShowGrocerySheet(false)
  }

  const handleDelete = () => {
    if (!recipe) return
    setIsDeleting(true)

    let undone = false

    const progressBar = (
      <div className="mt-2 h-0.5 w-full bg-muted overflow-hidden rounded-full">
        <div className="h-full bg-muted-foreground/50 origin-left animate-[toast-progress_5s_linear_forwards]" />
      </div>
    )

    toast({
      title: "Recipe deleted",
      description: (
        <>
          Tap Undo to restore it
          {progressBar}
        </>
      ),
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            undone = true
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
            setIsDeleting(false)
            toast({ title: "Delete cancelled" })
          }}
        >
          Undo
        </ToastAction>
      ),
    })

    undoTimerRef.current = setTimeout(async () => {
      if (undone) return
      try {
        await deleteRecipe(id)
        router.push("/recipes")
      } catch (err) {
        setIsDeleting(false)
        toast({
          title: "Failed to delete",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        })
      }
    }, 5000)
  }

  const handleCopy = async () => {
    if (!recipe) return
    try {
      const text = formatRecipeAsText(recipe, ingredients)
      await navigator.clipboard.writeText(text)
      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Recipe copied to clipboard" })
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" })
    }
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    )
  }

  if (!recipe) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center py-24 text-center">
          <ChefHat className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Recipe not found</p>
          <Link href="/recipes" className="mt-4">
            <Button variant="outline">Back to Recipes</Button>
          </Link>
        </div>
      </MainLayout>
    )
  }

  if (isEditing && recipe) {
    const editRecipe: ParsedRecipe = {
      title: recipe.title,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
      imageUrl: recipe.imageUrl,
      ingredients: ingredients.map((ing) => ({
        name: ing.name,
        canonicalName: ing.canonicalName,
        quantity: ing.quantity,
        unit: ing.unit,
        preparation: ing.preparation,
        ingredientGroup: ing.ingredientGroup,
        optional: ing.optional,
      })),
      steps: (recipe.instructions || []).map((s: any) =>
        typeof s === "string" ? s : s?.step || s?.text || JSON.stringify(s),
      ),
    }

    const editPantryMatches: PantryMatch[] = ingredients.map((ing) => ({
      ingredientName: ing.name,
      status: ing.pantryStatus,
      pantryItemName: ing.pantryItemName,
      daysUntilExpiry: ing.daysUntilExpiry,
    }))

    return (
      <RecipeReviewScreen
        mode="edit"
        recipeId={id}
        recipe={editRecipe}
        pantryMatches={editPantryMatches}
        compatibilityScore={compatibilityScore}
        sourceUrl={recipe.sourceUrl}
        sourcePlatform={recipe.sourcePlatform}
        notes={recipe.notes}
        onBack={() => setIsEditing(false)}
        onSaved={() => {
          setIsEditing(false)
          loadRecipe()
        }}
      />
    )
  }

  const prepTime = recipe.prepTimeMinutes ?? 0
  const cookTime = recipe.cookTimeMinutes ?? 0
  const displayTime = prepTime + cookTime > 0 ? prepTime + cookTime : (recipe.totalTimeMinutes ?? 0)
  const heroImage = recipe.imageUrl || (recipe.sourcePlatform === "youtube" ? getYouTubeThumbnail(recipe.sourceUrl) : null)

  return (
    <MainLayout>
      {/* Back + action buttons row */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/recipes">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Recipes
          </Button>
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setIsEditing(true)}
            title="Edit recipe"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <LoadingButton
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            isLoading={isDeleting}
            title="Delete recipe"
          >
            <Trash2 className="h-4 w-4" />
          </LoadingButton>
        </div>
      </div>

      {/* Hero image */}
      {heroImage && (
        <div className="mb-4 rounded-xl overflow-hidden">
          <img
            src={heroImage}
            alt={recipe.title}
            className="w-full max-h-56 object-cover"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none"
            }}
          />
        </div>
      )}

      {/* Title + meta */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold leading-snug mb-2">{recipe.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {displayTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {displayTime} min
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {recipe.servings} servings
            </span>
          )}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {({ youtube: "YouTube", instagram: "Instagram", twitter: "X", tiktok: "TikTok" } as Record<string, string>)[recipe.sourcePlatform!] || "Source"}
            </a>
          )}
        </div>
      </div>

      {/* Compatibility bar */}
      <div className="mb-5 rounded-xl border bg-card p-4">
        <CompatibilityBar score={compatibilityScore} />
        <p className="mt-2 text-xs text-muted-foreground">
          {ingredients.filter((i) => i.pantryStatus === "available" || i.pantryStatus === "expiring").length} of{" "}
          {ingredients.length} ingredients are in your pantry
        </p>
      </div>

      {/* Ingredients */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Ingredients</h2>
          {missingIngredients.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={openGrocerySheet}
            >
              <ShoppingCart className="h-3 w-3" />
              Add {missingIngredients.length} missing
            </Button>
          )}
        </div>
        <div className="rounded-xl border bg-card px-4">
          {ingredients.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">No ingredients recorded</p>
          ) : (
            ingredients.map((ing, idx) => {
              const prevGroup = idx > 0 ? ingredients[idx - 1].ingredientGroup : undefined
              const showGroupHeader = ing.ingredientGroup && ing.ingredientGroup !== prevGroup
              return (
                <div key={ing.id}>
                  {showGroupHeader && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-3 pb-1 border-b">
                      {ing.ingredientGroup}
                    </p>
                  )}
                  <IngredientRow ingredient={ing} />
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Instructions */}
      {recipe.instructions && recipe.instructions.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">Steps</h2>
          <ol className="space-y-3">
            {recipe.instructions.map((rawStep, i) => {
              const step = typeof rawStep === "string"
                ? rawStep
                : (rawStep as any)?.step || (rawStep as any)?.text || (rawStep as any)?.instruction || JSON.stringify(rawStep)
              return (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed flex-1">{step}</p>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <div className="mb-6 rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm leading-relaxed">{recipe.notes}</p>
        </div>
      )}

      {/* Grocery selector bottom sheet */}
      <Sheet open={showGrocerySheet} onOpenChange={setShowGrocerySheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
          <SheetHeader className="mb-3">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Add to Shopping List
            </SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm text-muted-foreground">
              {selectedGroceryItems.size} of {missingIngredients.length} selected
            </p>
            <button
              onClick={toggleAllGroceryItems}
              className="text-sm font-medium text-primary hover:underline"
            >
              {selectedGroceryItems.size === missingIngredients.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-1">
            {missingIngredients.map((ing, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedGroceryItems.has(idx)}
                  onChange={() => toggleGroceryItem(idx)}
                  className="h-5 w-5 rounded border-2 border-muted-foreground accent-primary shrink-0"
                />
                <span className="text-sm">{ing.canonicalName || ing.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 mt-4 pb-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowGrocerySheet(false)}>
              Cancel
            </Button>
            <LoadingButton
              className="flex-1"
              onClick={handleAddSelectedToList}
              disabled={isAddingToList || selectedGroceryItems.size === 0}
              isLoading={isAddingToList}
            >
              Add to List
            </LoadingButton>
          </div>
        </SheetContent>
      </Sheet>

    </MainLayout>
  )
}
