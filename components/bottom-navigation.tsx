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

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background z-50">
      <div className="flex justify-around items-center h-16 relative">
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center w-full h-full text-xs gap-1",
            isActive("/dashboard") ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-5 w-5" />
          <span>Inventory</span>
        </Link>

        <Link
          href="/analytics"
          className={cn(
            "flex flex-col items-center justify-center w-full h-full text-xs gap-1",
            isActive("/analytics") ? "text-primary" : "text-muted-foreground",
          )}
        >
          <BarChart2 className="h-5 w-5" />
          <span>Analytics</span>
        </Link>

        {/* Add Item Button - Positioned to overlap the navigation */}
        <Link
          href="/add-item"
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Add Item</span>
        </Link>

        <Link
          href="/shopping-list"
          className={cn(
            "flex flex-col items-center justify-center w-full h-full text-xs gap-1",
            isActive("/shopping-list") ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ShoppingCart className="h-5 w-5" />
          <span>Shopping</span>
        </Link>

        <Link
          href="/profile"
          className={cn(
            "flex flex-col items-center justify-center w-full h-full text-xs gap-1",
            isActive("/profile") ? "text-primary" : "text-muted-foreground",
          )}
        >
          <User className="h-5 w-5" />
          <span>Profile</span>
        </Link>
      </div>
    </div>
  )
}
