import { ShoppingList } from "@/components/shopping-list"
import { BottomNavigation } from "@/components/bottom-navigation"
import { AuthGate } from "@/components/auth-gate"

export default function ShoppingListPage() {
  return (
    <AuthGate>
      <>
        <ShoppingList />
        <BottomNavigation />
      </>
    </AuthGate>
  )
}
