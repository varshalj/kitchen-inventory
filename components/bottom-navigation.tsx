"use client"

import { Home, BarChart2, ShoppingCart, User, Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function BottomNavigation() {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === "/dashboard" && pathname === "/dashboard") return true
    if (path === "/analytics" && pathname === "/analytics") return true
    if (path === "/shopping-list" && pathname === "/shopping-list") return true
    if (path === "/profile" && pathname === "/profile") return true
    return false
  }

  const navLinkClass = (path: string) =>
    cn(
      "relative flex flex-col items-center justify-center w-full h-full text-xs gap-1 rounded-md transition-all duration-200",
      "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      isActive(path) ? "text-primary font-medium" : "text-muted-foreground",
    )

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background z-50">
      <div className="flex justify-around items-center h-16 relative">
        <Link href="/dashboard" className={navLinkClass("/dashboard")}>
          <Home className="h-5 w-5 transition-transform duration-200" />
          <span>Inventory</span>
          {isActive("/dashboard") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>

        <Link href="/analytics" className={navLinkClass("/analytics")}>
          <BarChart2 className="h-5 w-5 transition-transform duration-200" />
          <span>Analytics</span>
          {isActive("/analytics") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>

        <Link
          href="/add-item"
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-90 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Add Item</span>
        </Link>

        <Link href="/shopping-list" className={navLinkClass("/shopping-list")}>
          <ShoppingCart className="h-5 w-5 transition-transform duration-200" />
          <span>Shopping</span>
          {isActive("/shopping-list") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>

        <Link href="/profile" className={navLinkClass("/profile")}>
          <User className="h-5 w-5 transition-transform duration-200" />
          <span>Profile</span>
          {isActive("/profile") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>
      </div>
    </div>
  )
}
