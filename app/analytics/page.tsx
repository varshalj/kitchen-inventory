import { WasteAnalytics } from "@/components/waste-analytics"
import { BottomNavigation } from "@/components/bottom-navigation"
import { AuthGate } from "@/components/auth-gate"

export default function AnalyticsPage() {
  return (
    <AuthGate>
      <>
        <WasteAnalytics />
        <BottomNavigation />
      </>
    </AuthGate>
  )
}
