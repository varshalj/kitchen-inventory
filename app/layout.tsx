import type React from "react"
import { Providers } from "./providers"
import "./globals.css"

export const metadata = {
  title: "Kitchen Inventory",
  description: "Track your kitchen items, expiry dates, and recipes.",
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
