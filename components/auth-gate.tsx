"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { InventoryLoading } from "@/components/inventory-loading"

type AuthGateProps = {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      if (data.session) {
        setReady(true)
        return
      }

      const next = pathname || "/dashboard"
      router.replace(`/auth?next=${encodeURIComponent(next)}`)
    }

    void checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (!mounted) return

      if (session) {
        setReady(true)
      } else if (event === "SIGNED_OUT") {
        const next = pathname || "/dashboard"
        router.replace(`/auth?next=${encodeURIComponent(next)}`)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [pathname, router])

  if (!ready) return <InventoryLoading />

  return <>{children}</>
}
