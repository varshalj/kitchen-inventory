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

    // Wait for session to hydrate
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!mounted) return

      if (data.session) {
        setLoading(false)
      } else {
        router.replace("/auth?next=/dashboard")
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (!mounted) return

      if (session) {
        setLoading(false)
      } else if (event === "SIGNED_OUT") {
        router.replace("/auth?next=/dashboard")
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
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
