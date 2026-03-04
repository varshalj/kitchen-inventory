"use client"

import { useState, useCallback, useEffect } from "react"

const STORAGE_KEY = "onboarding_completed"

export function useOnboarding() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(STORAGE_KEY)
    setCompleted(stored === "true")
  }, [])

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true")
    setCompleted(true)
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setCompleted(false)
  }, [])

  return { completed, markCompleted, reset }
}
