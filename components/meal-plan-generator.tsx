"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Copy, Mail } from "lucide-react"
import type { InventoryItem } from "@/lib/types"

interface MealPlanGeneratorProps {
  items: InventoryItem[]
  onClose: () => void
}

export function MealPlanGenerator({ items, onClose }: MealPlanGeneratorProps) {
  const { toast } = useToast()
  const [skillLevel, setSkillLevel] = useState("intermediate")
  const [mealsPerDay, setMealsPerDay] = useState("3")
  const [servings, setServings] = useState("2")
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([])
  const [allergies, setAllergies] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState("")
  const [showPrompt, setShowPrompt] = useState(false)

  const dietaryOptions = [
    { id: "vegetarian", label: "Vegetarian" },
    { id: "vegan", label: "Vegan" },
    { id: "gluten-free", label: "Gluten-Free" },
    { id: "dairy-free", label: "Dairy-Free" },
    { id: "keto", label: "Keto" },
    { id: "low-carb", label: "Low Carb" },
  ]

  const handleDietaryChange = (id: string, checked: boolean) => {
    if (checked) {
      setDietaryRestrictions([...dietaryRestrictions, id])
    } else {
      setDietaryRestrictions(dietaryRestrictions.filter((item) => item !== id))
    }
  }

  const generatePrompt = () => {
    setIsGenerating(true)

    // Sort items by expiry date, prioritizing those expiring soon
    const sortedItems = [...items].sort((a, b) => {
      if (!a.expiryDate) return 1
      if (!b.expiryDate) return -1
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    })

    // Identify items expiring within 7 days
    const currentDate = new Date()
    const expiringItems = sortedItems.filter((item) => {
      if (!item.expiryDate) return false
      const expiryDate = new Date(item.expiryDate)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24))
      return daysUntilExpiry <= 7 && daysUntilExpiry > 0
    })

    // Format items list
    const formatItemsList = (items: InventoryItem[]) => {
      return items
        .map((item) => {
          const expiryInfo = item.expiryDate
            ? `expiry: ${new Date(item.expiryDate).toLocaleDateString()}`
            : "no expiry date"

          return `- ${item.name} (quantity: ${item.quantity || 1}, category: ${item.category}, ${expiryInfo})`
        })
        .join("\n")
    }

    // Build the prompt
    let prompt = `Create a meal plan using the following ingredients from my kitchen inventory. Please prioritize using items that are expiring soon.\n\n`

    if (expiringItems.length > 0) {
      prompt += `PRIORITY ITEMS (expiring within 7 days):\n${formatItemsList(expiringItems)}\n\n`
    }

    prompt += `ALL AVAILABLE ITEMS:\n${formatItemsList(sortedItems)}\n\n`

    prompt += `PREFERENCES:\n`
    prompt += `- Cooking skill level: ${skillLevel}\n`
    prompt += `- Meals per day: ${mealsPerDay}\n`
    prompt += `- Servings per meal: ${servings}\n`

    if (dietaryRestrictions.length > 0) {
      prompt += `- Dietary restrictions: ${dietaryRestrictions.join(", ")}\n`
    }

    if (allergies.trim()) {
      prompt += `- Allergies: ${allergies}\n`
    }

    prompt += `\nPlease create a 7-day meal plan that maximizes the use of my ingredients, especially those expiring soon. For each meal, include:\n`
    prompt += `1. Recipe name\n`
    prompt += `2. Ingredients needed (marking which ones I already have)\n`
    prompt += `3. Brief preparation instructions\n`
    prompt += `4. Estimated cooking time\n\n`

    prompt += `Also, please suggest a shopping list for additional ingredients I might need to complete the meal plan.`

    // Simulate generation delay
    setTimeout(() => {
      setGeneratedPrompt(prompt)
      setIsGenerating(false)
      setShowPrompt(true)
    }, 1500)
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      toast({
        title: "Copied to clipboard",
        description: "Paste this into ChatGPT or Claude to get your meal plan",
      })
    } catch (err) {
      toast({
        title: "Couldn't copy to clipboard",
        description: "Please copy the text manually",
        variant: "destructive",
      })
    }
  }

  const sendEmail = () => {
    const subject = encodeURIComponent("My Kitchen Inventory Meal Plan Prompt")
    const body = encodeURIComponent(generatedPrompt)
    window.location.href = `mailto:?subject=${subject}&body=${body}`

    toast({
      title: "Email client opened",
      description: "Send this email to yourself to save the prompt",
    })
  }

  return (
    <div className="space-y-4">
      {!showPrompt ? (
        <>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cooking Skill Level</Label>
              <RadioGroup value={skillLevel} onValueChange={setSkillLevel} className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="beginner" id="skill-beginner" />
                  <Label htmlFor="skill-beginner">Beginner</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="intermediate" id="skill-intermediate" />
                  <Label htmlFor="skill-intermediate">Intermediate</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="advanced" id="skill-advanced" />
                  <Label htmlFor="skill-advanced">Advanced</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="meals-per-day">Meals Per Day</Label>
                <Select value={mealsPerDay} onValueChange={setMealsPerDay}>
                  <SelectTrigger id="meals-per-day">
                    <SelectValue placeholder="Select meals per day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 meal</SelectItem>
                    <SelectItem value="2">2 meals</SelectItem>
                    <SelectItem value="3">3 meals</SelectItem>
                    <SelectItem value="4">4 meals</SelectItem>
                    <SelectItem value="5">5 meals</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="servings">Servings Per Meal</Label>
                <Select value={servings} onValueChange={setServings}>
                  <SelectTrigger id="servings">
                    <SelectValue placeholder="Select servings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 serving</SelectItem>
                    <SelectItem value="2">2 servings</SelectItem>
                    <SelectItem value="3">3 servings</SelectItem>
                    <SelectItem value="4">4 servings</SelectItem>
                    <SelectItem value="5">5 servings</SelectItem>
                    <SelectItem value="6">6+ servings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Dietary Restrictions</Label>
              <div className="grid grid-cols-2 gap-2">
                {dietaryOptions.map((option) => (
                  <div key={option.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={option.id}
                      checked={dietaryRestrictions.includes(option.id)}
                      onCheckedChange={(checked) => handleDietaryChange(option.id, checked === true)}
                    />
                    <Label htmlFor={option.id}>{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Input
                id="allergies"
                placeholder="e.g., nuts, shellfish, eggs"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={generatePrompt} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Meal Plan Prompt"
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="generated-prompt">Generated Prompt</Label>
            <div className="text-sm text-muted-foreground mb-2">
              Copy this prompt and paste it into ChatGPT or Claude to get your personalized meal plan.
            </div>
            <Textarea
              id="generated-prompt"
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              className="h-[300px] font-mono text-sm"
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPrompt(false)} className="order-3 sm:order-1">
              Back
            </Button>
            <Button variant="outline" onClick={sendEmail} className="order-2">
              <Mail className="mr-2 h-4 w-4" />
              Email to Self
            </Button>
            <Button onClick={copyToClipboard} className="order-1 sm:order-3">
              <Copy className="mr-2 h-4 w-4" />
              Copy to Clipboard
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
