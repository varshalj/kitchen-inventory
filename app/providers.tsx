"use client"

import type React from "react"
import { useEffect } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { UserSettingsProvider } from "@/hooks/use-user-settings"
import { Toaster } from "@/components/ui/toaster"
import { installConsoleCapture } from "@/lib/console-capture"
import { ScreenshotBugNudge } from "@/components/screenshot-bug-nudge"
import { OnboardingTour } from "@/components/onboarding-tour"
import { OnboardingProvider } from "@/hooks/use-onboarding"
import { PwaUpdateBanner } from "@/components/pwa-update-banner"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { ShoppingCountProvider } from "@/contexts/shopping-count-context"
import { RecipeImportProvider } from "@/contexts/recipe-import-context"

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installConsoleCapture()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <UserSettingsProvider>
        <OnboardingProvider>
          <ShoppingCountProvider>
            <RecipeImportProvider>
              {children}
              <Toaster />
              <ScreenshotBugNudge />
              <OnboardingTour />
              <PwaUpdateBanner />
              <PwaInstallPrompt />
            </RecipeImportProvider>
          </ShoppingCountProvider>
        </OnboardingProvider>
      </UserSettingsProvider>
    </ThemeProvider>
  )
}
