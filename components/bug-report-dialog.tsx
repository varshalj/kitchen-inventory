"use client"

import { useState } from "react"
import { Bug, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { formatLogsForReport } from "@/lib/console-capture"
import { triggerHaptic, HAPTIC_SUCCESS, HAPTIC_ERROR } from "@/lib/haptics"

interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const { toast } = useToast()
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!description.trim()) return

    setIsSubmitting(true)

    try {
      const logs = formatLogsForReport()
      const pageUrl = typeof window !== "undefined" ? window.location.href : "unknown"
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "unknown"

      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          pageUrl,
          userAgent,
          consoleLogs: logs,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || "Failed to submit bug report")
      }

      triggerHaptic(HAPTIC_SUCCESS)
      toast({
        title: "Bug report submitted",
        description: "Thank you! We'll look into this.",
      })
      setDescription("")
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit report"
      triggerHaptic(HAPTIC_ERROR)
      toast({
        title: "Submission failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Report a Bug
          </DialogTitle>
          <DialogDescription>
            Describe what went wrong. Console logs and page info are automatically attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue you experienced..."
              className="resize-none min-h-[120px]"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The report will include the current page URL, your browser info, and recent console logs to help us diagnose the issue.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
            className="active:scale-95 transition-transform"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
