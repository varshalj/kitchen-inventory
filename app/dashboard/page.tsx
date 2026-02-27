import { Suspense } from "react"
import { InventoryDashboard } from "@/components/inventory-dashboard"
import { InventoryLoading } from "@/components/inventory-loading"
import { BottomNavigation } from "@/components/bottom-navigation"

export default function DashboardPage() {
  return (
    <>
      <Suspense fallback={<InventoryLoading />}>
        <InventoryDashboard />
      </Suspense>
      <BottomNavigation />
    </>
  )
}
