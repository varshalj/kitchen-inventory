"use client"

import { createContext, useContext, useState, useCallback, useEffect } from "react"
import type React from "react"

const STORAGE_KEY = "onboarding_completed"

type OnboardingContextValue = {
  completed: boolean | null
  markCompleted: () => void
  reset: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <OnboardingContext value={{ completed, markCompleted, reset }}>
      {children}
    </OnboardingContext>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider")
  return ctx
}
