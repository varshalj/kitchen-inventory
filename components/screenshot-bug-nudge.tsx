"use client"

import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { BugReportDialog } from "@/components/bug-report-dialog"

/**
 * Detects screenshot keyboard shortcuts and shows a nudge toast
 * offering to open the bug report dialog.
 */
export function ScreenshotBugNudge() {
  const { toast } = useToast()
  const [showBugReport, setShowBugReport] = useState(false)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isScreenshot =
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5")) ||
        (e.key === "PrintScreen")

      if (isScreenshot) {
        setTimeout(() => {
          toast({
            title: "Took a screenshot?",
            description: "Report a bug to help us improve.",
            action: (
              <button
                className="text-xs font-medium text-primary underline whitespace-nowrap"
                onClick={() => setShowBugReport(true)}
              >
                Report Bug
              </button>
            ),
          })
        }, 500)
      }
    },
    [toast],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <BugReportDialog open={showBugReport} onOpenChange={setShowBugReport} />
  )
}
