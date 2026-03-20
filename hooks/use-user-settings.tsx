"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext } from "react"
import { DEFAULT_ORDER_SOURCES, DEFAULT_STORAGE_LOCATIONS } from "@/lib/dev-seed-fixtures"
import { GROCERY_PLATFORMS } from "@/lib/grocery-platforms"

export type UserSettings = {
  currency: string
  language: string
  theme: string
  notifications: boolean
  orderSources: string[]
  storageLocations: string[]
  country: string
  deliveryPlatforms: string[]
}

const defaultSettings: UserSettings = {
  currency: "INR",
  language: "en",
  theme: "light",
  notifications: true,
  orderSources: DEFAULT_ORDER_SOURCES,
  storageLocations: DEFAULT_STORAGE_LOCATIONS,
  country: "IN",
  deliveryPlatforms: GROCERY_PLATFORMS.map((p) => p.id),
}

// Merge saved settings with defaults so new keys introduced in future deploys
// are always present even for existing users who have an older saved object.
function mergeWithDefaults(saved: Partial<UserSettings>): UserSettings {
  return { ...defaultSettings, ...saved }
}

const UserSettingsContext = createContext<{
  settings: UserSettings | null
  updateSettings: (settings: Partial<UserSettings>) => void
}>({
  settings: null,
  updateSettings: () => {},
})

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    // Seed from localStorage immediately so the UI isn't blank on first render,
    // then sync from Supabase and update if the server has newer data.
    const cached = localStorage.getItem("userSettings")
    if (cached) {
      try {
        setSettings(mergeWithDefaults(JSON.parse(cached)))
      } catch {
        setSettings(defaultSettings)
      }
    } else {
      setSettings(defaultSettings)
    }

    // Fetch from Supabase (fire-and-forget; falls back to cached if it fails)
    fetch("/api/user-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.settings || Object.keys(data.settings).length === 0) return
        const merged = mergeWithDefaults(data.settings)
        setSettings(merged)
        localStorage.setItem("userSettings", JSON.stringify(merged))
      })
      .catch(() => {
        // Supabase unavailable — keep localStorage values
      })
  }, [])

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings } as UserSettings
      localStorage.setItem("userSettings", JSON.stringify(updated))

      // Persist to Supabase in the background
      fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: updated }),
      }).catch(() => {
        // Non-critical: localStorage already updated
      })

      return updated
    })
  }

  return <UserSettingsContext.Provider value={{ settings, updateSettings }}>{children}</UserSettingsContext.Provider>
}

export function useUserSettings() {
  return useContext(UserSettingsContext)
}
