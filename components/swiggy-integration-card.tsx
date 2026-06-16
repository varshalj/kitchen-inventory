"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ShoppingBag, ExternalLink, RotateCcw, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { fetchWithAuth } from "@/lib/api-client"

type ConnectionStatus = {
  connected: boolean
  expiresAt: string | null
  scope: string | null
  lastUsedAt: string | null
}

export function SwiggyIntegrationCard() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/integrations/swiggy/status")
      if (!res.ok) return
      const data = (await res.json()) as ConnectionStatus
      setStatus(data)
    } catch (err) {
      console.error("Failed to load Swiggy status:", err)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Surface the OAuth callback's result via query params.
  useEffect(() => {
    const swiggyParam = searchParams.get("swiggy")
    if (swiggyParam === "connected") {
      toast({ title: "Swiggy connected", description: "Your Swiggy account is linked." })
    } else if (swiggyParam === "error") {
      const reason = searchParams.get("reason") ?? "unknown"
      const detail = searchParams.get("detail") ?? ""
      toast({
        title: "Swiggy connection failed",
        description: `${reason}${detail ? ` — ${detail}` : ""}`,
        variant: "destructive",
      })
    }
  }, [searchParams, toast])

  const handleConnect = () => {
    // Full-page navigation so cookies set by the connect route are visible
    // to the subsequent callback redirect.
    window.location.href = "/api/integrations/swiggy/connect"
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/api/integrations/swiggy/disconnect", { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast({ title: "Swiggy disconnected" })
      setStatus({ connected: false, expiresAt: null, scope: null, lastUsedAt: null })
    } catch (err) {
      toast({
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "unknown error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    setLoading(true)
    setTestResult(null)
    try {
      const res = await fetchWithAuth("/api/integrations/swiggy/test")
      const body = await res.json()
      if (!res.ok) {
        setTestResult(`✗ ${body.error ?? "test failed"}: ${body.message ?? ""}`)
      } else {
        // Pretty-print just enough to confirm the call worked.
        const items = body.result?.structuredContent
        const summary = items
          ? typeof items === "string"
            ? items.slice(0, 300)
            : JSON.stringify(items).slice(0, 300)
          : "Call succeeded — no structured content returned."
        setTestResult(`✓ Connected. ${summary}`)
      }
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : "request failed"}`)
    } finally {
      setLoading(false)
      loadStatus()
    }
  }

  const expiresAtDisplay = status?.expiresAt
    ? new Date(status.expiresAt).toLocaleString()
    : null
  const lastUsedDisplay = status?.lastUsedAt
    ? new Date(status.lastUsedAt).toLocaleString()
    : null

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center">
          <ShoppingBag className="mr-2 h-4 w-4" />
          Swiggy Integration
        </CardTitle>
        <CardDescription>
          Connect your Swiggy account to push shopping list items straight into your Instamart cart.
          Cart-prep only — you confirm payment in the Swiggy app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        {status === null && (
          <p className="text-sm text-muted-foreground">Checking connection…</p>
        )}

        {status && !status.connected && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              Not connected. You'll be redirected to Swiggy to grant access.
            </p>
            <Button onClick={handleConnect} disabled={loading}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Connect Swiggy
            </Button>
          </div>
        )}

        {status?.connected && (
          <>
            <div className="text-sm space-y-1">
              <p>
                <span className="font-medium">Status:</span> Connected
              </p>
              {expiresAtDisplay && (
                <p className="text-muted-foreground text-xs">
                  Token expires {expiresAtDisplay}. Swiggy doesn't issue refresh tokens in v1.0
                  — you'll need to reconnect after that.
                </p>
              )}
              {lastUsedDisplay && (
                <p className="text-muted-foreground text-xs">Last used {lastUsedDisplay}.</p>
              )}
              {status.scope && (
                <p className="text-muted-foreground text-xs">Scopes: {status.scope}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleTest} disabled={loading} variant="outline" size="sm">
                <RotateCcw className="mr-2 h-4 w-4" />
                Test connection
              </Button>
              <Button onClick={handleConnect} disabled={loading} variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={loading}
                variant="ghost"
                size="sm"
                className="text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
            {testResult && (
              <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-words">
                {testResult}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
