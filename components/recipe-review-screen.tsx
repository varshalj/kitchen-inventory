"use client"

import { useState, useMemo } from "react"
import {
  Clock,
  Users,
  Check,
  AlertTriangle,
  X,
  ShoppingCart,
  Save,
  ArrowLeft,
  Flame,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { QuantityWithUnits } from "@/components/quantity-with-units"
import { useToast } from "@/hooks/use-toast"
import { saveRecipe, addToShoppingList } from "@/lib/client/api"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"
import type { ParsedRecipe, ParsedIngredient, PantryMatch, PantryMatchStatus } from "@/lib/types"

interface RecipeReviewScreenProps {
  importId: string
  recipe: ParsedRecipe
  pantryMatches: PantryMatch[]
  compatibilityScore: number
  sourceUrl: string
  sourcePlatform: string
  onBack: () => void
  onSaved: () => void
}

interface EditableIngredient extends ParsedIngredient {
  pantryStatus: PantryMatchStatus
  pantryItemName?: string
  daysUntilExpiry?: number
}

const STATUS_CONFIG: Record<PantryMatchStatus, { label: string; color: string; icon: typeof Check }> = {
  available: { label: "In pantry", color: "bg-green-100 text-green-800 border-green-200", icon: Check },
  expiring: { label: "Expiring soon", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  expired: { label: "Expired", color: "bg-red-100 text-red-800 border-red-200", icon: X },
  missing: { label: "Missing", color: "bg-gray-100 text-gray-600 border-gray-200", icon: ShoppingCart },
}

export function RecipeReviewScreen({
  importId,
  recipe: initialRecipe,
  pantryMatches,
  compatibilityScore,
  sourceUrl,
  sourcePlatform,
  onBack,
  onSaved,
}: RecipeReviewScreenProps) {
  const { toast } = useToast()

  const [title, setTitle] = useState(initialRecipe.title)
  const [servings, setServings] = useState(initialRecipe.servings ?? 0)
  const [prepTime, setPrepTime] = useState(initialRecipe.prepTimeMinutes ?? 0)
  const [cookTime, setCookTime] = useState(initialRecipe.cookTimeMinutes ?? 0)
  const [steps, setSteps] = useState<string[]>(initialRecipe.steps || [])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [addingToList, setAddingToList] = useState(false)

  const [ingredients, setIngredients] = useState<EditableIngredient[]>(() => {
    return (initialRecipe.ingredients || []).map((ing) => {
      const match = pantryMatches.find(
        (m) => m.ingredientName === ing.name,
      )
      return {
        ...ing,
        pantryStatus: match?.status || "missing",
        pantryItemName: match?.pantryItemName,
        daysUntilExpiry: match?.daysUntilExpiry,
      }
    })
  })

  const missingIngredients = useMemo(
    () => ingredients.filter((i) => i.pantryStatus === "missing"),
    [ingredients],
  )

  const updateIngredient = (index: number, updates: Partial<EditableIngredient>) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...updates } : ing)),
    )
  }

  const updateStep = (index: number, text: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? text : s)))
  }

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      await saveRecipe({
        title,
        importId,
        sourceUrl,
        sourcePlatform,
        servings: servings || undefined,
        prepTimeMinutes: prepTime || undefined,
        cookTimeMinutes: cookTime || undefined,
        totalTimeMinutes: initialRecipe.totalTimeMinutes || undefined,
        instructions: steps.filter(Boolean),
        imageUrl: initialRecipe.imageUrl,
        notes: notes || undefined,
        ingredients: ingredients.map((ing, i) => ({
          name: ing.name,
          canonicalName: ing.canonicalName,
          quantity: ing.quantity,
          unit: ing.unit,
          preparation: ing.preparation,
          ingredientGroup: ing.ingredientGroup,
          optional: ing.optional,
          sortOrder: i,
        })),
      })

      triggerHaptic(HAPTIC_SUCCESS)
      toast({ title: "Recipe saved!" })
      onSaved()
    } catch (err) {
      triggerHaptic(HAPTIC_ERROR)
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddMissingToShoppingList = async () => {
    if (missingIngredients.length === 0) return

    setAddingToList(true)
    let added = 0

    for (const ing of missingIngredients) {
      try {
        await addToShoppingList({
          id: "",
          name: ing.canonicalName || ing.name,
          quantity: ing.quantity ?? 1,
          unit: ing.unit,
          category: "",
          completed: false,
          addedOn: new Date().toISOString(),
          addedFrom: "manual",
        })
        added++
      } catch {
        // Some items may fail (duplicates), that's okay
      }
    }

    triggerHaptic(HAPTIC_SUCCESS)
    toast({
      title: `Added ${added} item${added !== 1 ? "s" : ""} to shopping list`,
    })
    setAddingToList(false)
  }

  const scoreColor =
    compatibilityScore >= 70
      ? "text-green-600"
      : compatibilityScore >= 40
        ? "text-amber-600"
        : "text-red-600"

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="container max-w-md mx-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">Review Recipe</h1>
        </div>

        {/* Recipe image preview */}
        {initialRecipe.imageUrl && (
          <div className="mb-4 rounded-xl overflow-hidden">
            <img
              src={initialRecipe.imageUrl}
              alt={initialRecipe.title}
              className="w-full max-h-48 object-cover"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none"
              }}
            />
          </div>
        )}

        {/* Compatibility Score */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Pantry Match</span>
              </div>
              <span className={`text-2xl font-bold ${scoreColor}`}>
                {compatibilityScore}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  compatibilityScore >= 70
                    ? "bg-green-500"
                    : compatibilityScore >= 40
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${compatibilityScore}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ingredients.filter((i) => i.pantryStatus === "available" || i.pantryStatus === "expiring").length} of{" "}
              {ingredients.length} ingredients in your pantry
            </p>
          </CardContent>
        </Card>

        {/* Title */}
        <div className="space-y-1 mb-4">
          <Label htmlFor="recipe-title">Title</Label>
          <Input
            id="recipe-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Users className="h-3 w-3" /> Servings
            </Label>
            <Input
              type="number"
              value={servings || ""}
              onChange={(e) => setServings(parseInt(e.target.value) || 0)}
              min={0}
              step="any"
              className="text-center"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" /> Prep (min)
            </Label>
            <Input
              type="number"
              value={prepTime || ""}
              onChange={(e) => setPrepTime(parseInt(e.target.value) || 0)}
              min={0}
              step="any"
              className="text-center"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" /> Cook (min)
            </Label>
            <Input
              type="number"
              value={cookTime || ""}
              onChange={(e) => setCookTime(parseInt(e.target.value) || 0)}
              min={0}
              step="any"
              className="text-center"
            />
          </div>
        </div>

        {/* Ingredients */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">
              Ingredients ({ingredients.length})
            </Label>
            {missingIngredients.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleAddMissingToShoppingList}
                disabled={addingToList}
              >
                <ShoppingCart className="h-3 w-3" />
                Add {missingIngredients.length} missing to list
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, i) => {
              const config = STATUS_CONFIG[ing.pantryStatus]
              const Icon = config.icon
              const prevGroup = i > 0 ? ingredients[i - 1].ingredientGroup : undefined
              const showGroupHeader = ing.ingredientGroup && ing.ingredientGroup !== prevGroup
              return (
                <div key={i}>
                  {showGroupHeader && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-1">
                      {ing.ingredientGroup}
                    </p>
                  )}
                  <Card className="overflow-hidden">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-0.5">
                          <Input
                            value={ing.name}
                            onChange={(e) => updateIngredient(i, { name: e.target.value })}
                            className="text-sm h-8"
                          />
                          {ing.preparation && (
                            <p className="text-xs text-muted-foreground pl-1">{ing.preparation}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${config.color}`}
                        >
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                          {ing.pantryStatus === "expiring" && ing.daysUntilExpiry != null && (
                            <span className="ml-0.5">({ing.daysUntilExpiry}d)</span>
                          )}
                        </Badge>
                      </div>
                      <QuantityWithUnits
                        value={ing.quantity ?? 0}
                        unit={ing.unit || "pcs"}
                        onChange={(val, u) => updateIngredient(i, { quantity: val, unit: u })}
                      />
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>

        {/* Steps */}
        <div className="mb-4">
          <Label className="text-sm font-medium mb-2 block">
            Steps ({steps.length})
          </Label>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground font-mono mt-2.5 w-5 shrink-0 text-right">
                  {i + 1}.
                </span>
                <Textarea
                  value={step}
                  onChange={(e) => updateStep(i, e.target.value)}
                  className="text-sm min-h-[60px]"
                  rows={2}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 mt-0.5"
                  onClick={() => removeStep(i)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setSteps((prev) => [...prev, ""])}
          >
            + Add step
          </Button>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <Label htmlFor="recipe-notes" className="text-sm font-medium mb-2 block">
            Notes (optional)
          </Label>
          <Textarea
            id="recipe-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your personal notes about this recipe…"
            rows={2}
          />
        </div>

        {/* Source */}
        <p className="text-xs text-muted-foreground mb-4 truncate">
          Source: {sourceUrl}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onBack}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 gap-1"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Recipe"}
          </Button>
        </div>
      </div>
    </div>
  )
}
