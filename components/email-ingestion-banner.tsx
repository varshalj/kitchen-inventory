"use client"

import { useState } from "react"
import { Mail, X, AlertTriangle, Package, ChevronDown, ChevronUp, Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/hooks/use-toast"
import { fetchWithAuth } from "@/lib/api-client"
import { BugReportDialog } from "@/components/bug-report-dialog"
import { EmailIngestionReview } from "@/components/email-ingestion-review"
import { cn } from "@/lib/utils"
import type { EmailIngestionRow } from "@/lib/server/repositories/email-ingestion-repo"

interface EmailIngestionBannerProps {
  ingestions: EmailIngestionRow[]
  onRefresh: () => void
}

export function EmailIngestionBanner({ ingestions, onRefresh }: EmailIngestionBannerProps) {
  const { toast } = useToast()
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const [showBugReport, setShowBugReport] = useState(false)
  const [bugReportContext, setBugReportContext] = useState("")
  const [reviewIngestion, setReviewIngestion] = useState<EmailIngestionRow | null>(null)
  const [showSkippedList, setShowSkippedList] = useState(false)

  const readyIngestions = ingestions.filter((i) => i.status === "ready")
  const skippedIngestions = ingestions.filter((i) => i.status === "skipped")
  const failedIngestions = ingestions.filter((i) => i.status === "failed")

  if (ingestions.length === 0) return null

  const handleDismiss = async (id: string) => {
    setDismissingIds((prev) => new Set(prev).add(id))
    try {
      await fetchWithAuth(`/api/email-ingestion/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      })
      onRefresh()
    } catch {
      toast({ title: "Failed to dismiss", variant: "destructive" })
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleReport = (ingestion: EmailIngestionRow) => {
    const ctx = [
      `Email ingestion ID: ${ingestion.id}`,
      ingestion.sender_email && `Sender: ${ingestion.sender_email}`,
      ingestion.subject && `Subject: ${ingestion.subject}`,
      ingestion.error_message && `Error: ${ingestion.error_message}`,
      "",
      "This was a grocery order email that should have been processed.",
    ]
      .filter(Boolean)
      .join("\n")
    setBugReportContext(ctx)
    setShowBugReport(true)
  }

  const totalReadyItems = readyIngestions.reduce((sum, i) => sum + (i.item_count || 0), 0)

  return (
    <>
      <div className="space-y-2">
        {/* Ready banners */}
        {readyIngestions.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {readyIngestions.length === 1
                    ? `${totalReadyItems} item${totalReadyItems !== 1 ? "s" : ""} from your ${readyIngestions[0].platform || "email"} order`
                    : `${readyIngestions.length} orders ready to review (${totalReadyItems} items)`}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {readyIngestions.map((ing) => (
                    <Button
                      key={ing.id}
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => setReviewIngestion(ing)}
                    >
                      Review{ing.platform ? ` ${ing.platform}` : ""}
                      {ing.item_count ? ` (${ing.item_count})` : ""}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skipped banners */}
        {skippedIngestions.length > 0 && (
          <div className="rounded-lg border border-muted bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {skippedIngestions.length === 1 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Email from <span className="font-medium">{skippedIngestions[0].sender_email || "unknown sender"}</span> was skipped (not recognized as grocery).
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleReport(skippedIngestions[0])}
                      >
                        <Bug className="h-3 w-3 mr-1" />
                        Report
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={dismissingIds.has(skippedIngestions[0].id)}
                        onClick={() => handleDismiss(skippedIngestions[0].id)}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowSkippedList(!showSkippedList)}
                    >
                      {skippedIngestions.length} emails were skipped
                      {showSkippedList ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    {showSkippedList && (
                      <div className="mt-2 space-y-2">
                        {skippedIngestions.map((ing) => (
                          <div key={ing.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate flex-1 min-w-0 mr-2">
                              {ing.sender_email || "unknown"} — {ing.subject || "no subject"}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-2"
                                onClick={() => handleReport(ing)}
                              >
                                Report
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-1"
                                disabled={dismissingIds.has(ing.id)}
                                onClick={() => handleDismiss(ing.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Failed banners */}
        {failedIngestions.map((ing) => (
          <div key={ing.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-destructive">
                  Could not process email from {ing.sender_email || "unknown sender"}
                </p>
                {ing.error_message && (
                  <p className="text-xs text-destructive/80 mt-0.5">{ing.error_message}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => handleReport(ing)}
                  >
                    <Bug className="h-3 w-3 mr-1" />
                    Report
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={dismissingIds.has(ing.id)}
                    onClick={() => handleDismiss(ing.id)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {reviewIngestion && (
        <EmailIngestionReview
          ingestion={reviewIngestion}
          open={!!reviewIngestion}
          onOpenChange={(open) => {
            if (!open) setReviewIngestion(null)
          }}
          onSaved={onRefresh}
        />
      )}

      <BugReportDialog
        open={showBugReport}
        onOpenChange={setShowBugReport}
      />
    </>
  )
}
