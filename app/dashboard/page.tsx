"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { InventoryDashboard } from "@/components/inventory-dashboard"
import { InventoryLoading } from "@/components/inventory-loading"
import { BottomNavigation } from "@/components/bottom-navigation"

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          router.replace("/auth?next=/dashboard")
        } else {
          setLoading(false)
        }
      }
    )

    // Also check initial session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setLoading(false)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [router])

  if (loading) return <InventoryLoading />

  return (
    <>
      <InventoryDashboard />
      <BottomNavigation />
    </>
  )
}
