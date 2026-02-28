"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext } from "react"
import { DEFAULT_ORDER_SOURCES, DEFAULT_STORAGE_LOCATIONS } from "@/lib/dev-seed-fixtures"

type UserSettings = {
  currency: string
  language: string
  theme: string
  notifications: boolean
  orderSources: string[]
  storageLocations: string[]
}

const defaultSettings: UserSettings = {
  currency: "INR",
  language: "en",
  theme: "light",
  notifications: true,
  orderSources: DEFAULT_ORDER_SOURCES,
  storageLocations: DEFAULT_STORAGE_LOCATIONS,
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
    // In a real app, we would fetch settings from an API or local storage
    const savedSettings = localStorage.getItem("userSettings")
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings))
      } catch (e) {
        setSettings(defaultSettings)
      }
    } else {
      setSettings(defaultSettings)
    }
  }, [])

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings } as UserSettings
      localStorage.setItem("userSettings", JSON.stringify(updated))
      return updated
    })
  }

  return <UserSettingsContext.Provider value={{ settings, updateSettings }}>{children}</UserSettingsContext.Provider>
}

export function useUserSettings() {
  return useContext(UserSettingsContext)
}
