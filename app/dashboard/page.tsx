"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Suspense } from "react"
import { InventoryDashboard } from "@/components/inventory-dashboard"
import { InventoryLoading } from "@/components/inventory-loading"
import { BottomNavigation } from "@/components/bottom-navigation"
import { supabase } from "@/lib/supabase-client"

export default function DashboardPage() {
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.replace("/auth")
      } else {
        setIsCheckingAuth(false)
      }
    }

    checkSession()
  }, [router])

  if (isCheckingAuth) {
    return <InventoryLoading />
  }

  return (
    <>
      <Suspense fallback={<InventoryLoading />}>
        <InventoryDashboard />
      </Suspense>
      <BottomNavigation />
    </>
  )
}
