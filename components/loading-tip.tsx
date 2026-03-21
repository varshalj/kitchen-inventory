"use client"

import { useMemo } from "react"
import { Lightbulb } from "lucide-react"

const TIPS = [
  "Store bananas away from other fruits — they release ethylene gas that speeds up ripening.",
  "Freeze herbs in olive oil using ice cube trays for instant flavour in cooking.",
  "Keep ginger unpeeled in the freezer — it grates more easily and lasts months.",
  "Wilted greens? Soak them in ice water for 10 minutes to revive crunch.",
  "Store onions and potatoes separately — together they spoil faster.",
  "Wrap celery in aluminium foil to keep it crisp for weeks in the fridge.",
  "Ripe avocados last longer in the fridge — move them once they feel ready.",
  "Store mushrooms in a paper bag, not plastic, to prevent them from getting slimy.",
  "Bread stays fresher longer when stored in a cool, dark place rather than the fridge.",
  "Freeze overripe bananas for smoothies or banana bread — no waste!",
  "A bay leaf in your rice or flour container helps keep insects away.",
  "Store tomatoes stem-side down at room temperature for best flavour.",
  "Keep dairy products at the back of the fridge where it's coldest, not the door.",
  "Leftover coffee? Freeze it in ice cube trays for iced coffee without dilution.",
  "Store spring onions in a glass of water on the counter — they'll keep growing.",
  "Citrus zest can be frozen and used later to add zing to any dish.",
  "Airtight containers keep spices fresh 2-3x longer than open jars.",
  "Plan meals around what expires first to cut food waste by up to 30%.",
]

export function LoadingTip() {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], [])

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
      <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-900 dark:text-amber-200">
        <span className="font-medium">Did you know?</span> {tip}
      </p>
    </div>
  )
}
