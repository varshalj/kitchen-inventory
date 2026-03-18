import { Suspense } from "react"
import { RecipesList } from "@/components/recipes-list"
import { BottomNavigation } from "@/components/bottom-navigation"

export default function RecipesPage() {
  return (
    <>
      <Suspense>
        <RecipesList />
      </Suspense>
      <BottomNavigation />
    </>
  )
}
