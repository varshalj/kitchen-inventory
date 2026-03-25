"use client"

import { Home, BarChart2, ShoppingCart, ChefHat, Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useShoppingCount } from "@/contexts/shopping-count-context"
import { useRecipeImportCount } from "@/contexts/recipe-import-context"
import { useEmailIngestionCount } from "@/contexts/email-ingestion-context"

export function BottomNavigation() {
  const pathname = usePathname()
  const { incompleteCount } = useShoppingCount()
  const { pendingRecipeImportCount } = useRecipeImportCount()
  const { pendingEmailIngestionCount } = useEmailIngestionCount()

  const isActive = (path: string) => {
    if (path === "/dashboard" && pathname === "/dashboard") return true
    if (path === "/analytics" && pathname === "/analytics") return true
    if (path === "/shopping-list" && pathname === "/shopping-list") return true
    if (path === "/recipes" && (pathname === "/recipes" || pathname.startsWith("/recipes/"))) return true
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
          <div className="relative">
            <Home className="h-5 w-5 transition-transform duration-200" />
            {pendingEmailIngestionCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
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
          <div className="relative">
            <ShoppingCart className="h-5 w-5 transition-transform duration-200" />
            {incompleteCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {incompleteCount > 9 ? "9+" : incompleteCount}
              </span>
            )}
          </div>
          <span>Shopping</span>
          {isActive("/shopping-list") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>

        <Link href="/recipes" className={navLinkClass("/recipes")}>
          <div className="relative">
            <ChefHat className="h-5 w-5 transition-transform duration-200" />
            {pendingRecipeImportCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
          <span>Recipes</span>
          {isActive("/recipes") && (
            <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>
      </div>
    </div>
  )
}
