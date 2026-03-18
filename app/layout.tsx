import type React from "react"
import type { Viewport } from "next"
import { Providers } from "./providers"
import "./globals.css"

export const metadata = {
  title: "Kitchen Inventory",
  description: "Track your kitchen items, expiry dates, and recipes.",
}

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
