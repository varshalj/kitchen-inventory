"use client"

import { useCallback, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import type { ToastActionElement } from "@/components/ui/toast"

/**
 * Returns a `toastWithNudge` helper that works exactly like `toast()` but
 * appends a "Report Bug" action element when `variant === "destructive"`.
 *
 * The caller must also render <BugReportOnError open={...} onOpenChange={...} />
 * (or equivalent) that reads `bugReportOpen`.
 */
export function useBugReportNudge() {
  const { toast } = useToast()
  const [bugReportOpen, setBugReportOpen] = useState(false)

  const toastWithNudge = useCallback(
    (options: Parameters<typeof toast>[0]) => {
      if (options.variant !== "destructive") {
        return toast(options)
      }

      const reportAction: ToastActionElement = (
        <button
          className="shrink-0 text-xs font-medium underline text-destructive-foreground/80 hover:text-destructive-foreground whitespace-nowrap"
          onClick={() => setBugReportOpen(true)}
        >
          Report Bug
        </button>
      ) as ToastActionElement

      return toast({
        ...options,
        action: options.action ?? reportAction,
      })
    },
    [toast],
  )

  return { toastWithNudge, bugReportOpen, setBugReportOpen }
}
