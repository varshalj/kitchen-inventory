"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setIsReady(true)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (!isReady) {
    return null
  }

  return <>{children}</>
}
