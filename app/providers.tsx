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
import { EmailIngestionProvider } from "@/contexts/email-ingestion-context"
import { InventoryProvider } from "@/contexts/inventory-context"
import { ReviewProvider } from "@/contexts/review-context"

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
              <EmailIngestionProvider>
                {/*
                  Inventory cache + Review queue are both app-level so they
                  survive page navigation. Inventory wraps Review so the
                  rating chip (if needed) can later read item context from
                  the cache without an extra fetch.
                */}
                <InventoryProvider>
                  <ReviewProvider>
                    {children}
                    <Toaster />
                    <ScreenshotBugNudge />
                    <OnboardingTour />
                    <PwaUpdateBanner />
                    <PwaInstallPrompt />
                  </ReviewProvider>
                </InventoryProvider>
              </EmailIngestionProvider>
            </RecipeImportProvider>
          </ShoppingCountProvider>
        </OnboardingProvider>
      </UserSettingsProvider>
    </ThemeProvider>
  )
}
