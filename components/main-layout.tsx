import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface MainLayoutProps {
  children: ReactNode
  className?: string
}

export function MainLayout({ children, className }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className={cn("container max-w-md mx-auto p-4 pb-28", className)}>{children}</main>
    </div>
  )
}
