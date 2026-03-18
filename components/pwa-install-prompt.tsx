"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const DISMISSED_KEY = "pwa-install-dismissed"

function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true
}

export function PwaInstallPrompt() {
  const pathname = usePathname()
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIosBrowser, setIsIosBrowser] = useState(false)
  const promptCaptured = useRef(false)

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISSED_KEY)) return

    if (isIos()) {
      setIsIosBrowser(true)
      setShowBanner(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      if (!promptCaptured.current) {
        promptCaptured.current = true
        setDeferredPrompt(e)
        setShowBanner(true)
      }
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  // Only show on authenticated pages (dashboard, recipes, etc.)
  if (pathname === "/" || pathname?.startsWith("/auth") || pathname?.startsWith("/landing")) return null
  if (!showBanner) return null

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setShowBanner(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem(DISMISSED_KEY, "1")
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 rounded-xl border bg-background shadow-lg p-4 animate-in slide-in-from-bottom-4 duration-300">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      {isIosBrowser ? (
        <div className="flex items-start gap-3 pr-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Share className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Install Kitchen Inventory</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap <Share className="inline h-3 w-3 -mt-0.5" /> then <span className="font-medium">Add to Home Screen</span> to install this app.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 pr-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Install Kitchen Inventory</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get quick access from your home screen and share screenshots directly.
            </p>
          </div>
          <Button size="sm" className="shrink-0 h-8" onClick={handleInstall}>
            Install
          </Button>
        </div>
      )}
    </div>
  )
}
