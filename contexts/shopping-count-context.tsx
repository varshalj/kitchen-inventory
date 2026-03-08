"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { fetchWithAuth } from "@/lib/api-client"

interface ShoppingCountContextValue {
  incompleteCount: number
  setIncompleteCount: (n: number | ((prev: number) => number)) => void
  refreshCount: () => Promise<void>
}

const ShoppingCountContext = createContext<ShoppingCountContextValue>({
  incompleteCount: 0,
  setIncompleteCount: () => {},
  refreshCount: async () => {},
})

export function useShoppingCount() {
  return useContext(ShoppingCountContext)
}

export function ShoppingCountProvider({ children }: { children: React.ReactNode }) {
  const [incompleteCount, setIncompleteCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/shopping")
      if (!response.ok) return
      const data = await response.json()
      const items = Array.isArray(data) ? data : []
      const count = items.filter((i: { completed: boolean }) => !i.completed).length
      setIncompleteCount(count)
    } catch {
      // Silently fail — badge just won't update
    }
  }, [])

  useEffect(() => {
    refreshCount()
    intervalRef.current = setInterval(refreshCount, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [refreshCount])

  return (
    <ShoppingCountContext.Provider value={{ incompleteCount, setIncompleteCount, refreshCount }}>
      {children}
    </ShoppingCountContext.Provider>
  )
}
