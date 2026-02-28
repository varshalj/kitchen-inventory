"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { DEV_SEED_AUTH_USER, type AuthUserProfile } from "@/lib/dev-seed-fixtures"

const AUTH_USER_STORAGE_KEY = "authUser"

const AuthUserContext = createContext<{
  user: AuthUserProfile | null
  signIn: (profile?: AuthUserProfile) => void
  signOut: () => void
}>({
  user: null,
  signIn: () => {},
  signOut: () => {},
})

export function AuthUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null)

  useEffect(() => {
    const savedUser = localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser) as AuthUserProfile)
        return
      } catch {
        // fall back to seeded user profile
      }
    }

    setUser(DEV_SEED_AUTH_USER)
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(DEV_SEED_AUTH_USER))
  }, [])

  const signIn = (profile: AuthUserProfile = DEV_SEED_AUTH_USER) => {
    setUser(profile)
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(profile))
  }

  const signOut = () => {
    setUser(null)
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  }

  return <AuthUserContext.Provider value={{ user, signIn, signOut }}>{children}</AuthUserContext.Provider>
}

export function useAuthUser() {
  return useContext(AuthUserContext)
}
