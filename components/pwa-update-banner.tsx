"use client"

import { useState, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PwaUpdateBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const handleControllerChange = () => {
      window.location.reload()
    }

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (!registration) return

        if (registration.waiting) {
          setWaitingWorker(registration.waiting)
          setShowBanner(true)
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker)
              setShowBanner(true)
            }
          })
        })
      } catch {
        // service worker not supported or not registered
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    checkForUpdate()

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
    }
  }, [])

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" })
    }
  }

  if (!showBanner) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
      <p className="text-sm font-medium">A new version is available</p>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 h-7 text-xs gap-1.5"
        onClick={handleUpdate}
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </Button>
    </div>
  )
}
