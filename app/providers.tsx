"use client"

import type React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { UserSettingsProvider } from "@/hooks/use-user-settings"
import { AuthUserProvider } from "@/hooks/use-auth-user"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthUserProvider><UserSettingsProvider>{children}</UserSettingsProvider></AuthUserProvider>
    </ThemeProvider>
  )
}
