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
    let mounted = true

    // First check initial session
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return

      if (data.session) {
        setLoading(false)
      } else {
        router.replace("/auth?next=/dashboard")
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return

        if (event === "SIGNED_IN" && session) {
          setLoading(false)
        }

        if (event === "SIGNED_OUT") {
          router.replace("/auth?next=/dashboard")
        }
      }
    )

    return () => {
      mounted = false
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
