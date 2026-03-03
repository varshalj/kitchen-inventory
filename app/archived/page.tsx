import { ArchivedItems } from "@/components/archived-items"
import { BottomNavigation } from "@/components/bottom-navigation"
import { AuthGate } from "@/components/auth-gate"

export default function ArchivedPage() {
  return (
    <AuthGate>
      <>
        <ArchivedItems />
        <BottomNavigation />
      </>
    </AuthGate>
  )
}
