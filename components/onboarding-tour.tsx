"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { useOnboarding } from "@/hooks/use-onboarding"

export function OnboardingTour() {
  const { completed, markCompleted } = useOnboarding()
  const pathname = usePathname()
  const startedRef = useRef(false)

  useEffect(() => {
    if (completed === false) {
      startedRef.current = false
    }
  }, [completed])

  useEffect(() => {
    if (completed !== false) return
    if (pathname !== "/dashboard") return
    if (startedRef.current) return
    startedRef.current = true

    const timeout = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "rgba(0,0,0,0.5)",
        onDestroyStarted: () => {
          markCompleted()
          driverObj.destroy()
        },
        steps: [
          {
            popover: {
              title: "Welcome to Kitchen Inventory!",
              description:
                "Let's take a quick tour so you know your way around. You can restart this anytime from Profile Settings.",
            },
          },
          {
            element: 'a[href="/add-item"]',
            popover: {
              title: "Add Items",
              description:
                "Tap this button to add items to your inventory. You can scan receipts, take photos, or add manually.",
              side: "top" as const,
            },
          },
          {
            element: 'a[href="/dashboard"]',
            popover: {
              title: "Your Inventory",
              description:
                "View and manage all your kitchen items here. Swipe or use the menu to consume, waste, or delete items.",
              side: "top" as const,
            },
          },
          {
            element: 'a[href="/shopping-list"]',
            popover: {
              title: "Shopping List",
              description:
                "Items you consume are automatically added here. You can also buy them directly from grocery apps!",
              side: "top" as const,
            },
          },
          {
            element: 'a[href="/analytics"]',
            popover: {
              title: "Analytics",
              description:
                "Track your consumption patterns, waste, and get insights to save money.",
              side: "top" as const,
            },
          },
          {
            element: 'a[href="/profile"]',
            popover: {
              title: "Profile & Settings",
              description:
                "Customize storage locations, order sources, currency, delivery platforms, and more.",
              side: "top" as const,
            },
          },
          {
            popover: {
              title: "Install as an App",
              description:
                "Add Kitchen Inventory to your home screen for quick access. On iOS, tap Share then 'Add to Home Screen'. On Android, tap the install banner.",
            },
          },
          {
            popover: {
              title: "Scan Order Screenshots",
              description:
                "Ordered from Blinkit, Zepto, or Swiggy? Screenshot your order confirmation and share it to Kitchen Inventory — all items get extracted automatically.",
            },
          },
          {
            popover: {
              title: "Share Recipe Links",
              description:
                "Found a recipe on YouTube or Instagram? Share the link directly to Kitchen Inventory and we'll import it for you.",
            },
          },
          {
            popover: {
              title: "You're all set!",
              description:
                "Start by adding your first item. You can restart this tour anytime from Profile Settings.",
            },
          },
        ],
      })

      driverObj.drive()
    }, 800)

    return () => clearTimeout(timeout)
  }, [completed, pathname, markCompleted])

  return null
}
