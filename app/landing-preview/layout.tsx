import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Kitchen Inventory - Track, Plan, and Save",
  description: "Never waste food again. Track expiry dates, get AI meal suggestions, and sync with delivery apps.",
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
