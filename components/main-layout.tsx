import type { ReactNode } from "react"

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-md mx-auto p-4 pb-28">{children}</main>
    </div>
  )
}
