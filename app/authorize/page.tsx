"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, CheckCircle, XCircle, Loader2 } from "lucide-react"

// #region agent log
function serverLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
  fetch("/api/mcp-debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location: "authorize/page.tsx", message, data, hypothesisId, timestamp: Date.now() }),
  }).catch(() => {})
}
// #endregion

function AuthorizeInner() {
  const searchParams = useSearchParams()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authDetails, setAuthDetails] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // #region agent log
  const authorizationId = searchParams.get("authorization_id")
  serverLog("consent page rendered", {
    authorizationId,
    allParams: Object.fromEntries([...searchParams.entries()]),
  }, "H1")
  // #endregion

  useEffect(() => {
    async function init() {
      // #region agent log
      serverLog("init started", { authorizationId }, "H1")
      // #endregion

      if (!authorizationId) {
        // #region agent log
        serverLog("no authorization_id in URL", { allParams: Object.fromEntries([...searchParams.entries()]) }, "H1")
        // #endregion
        setError("Missing authorization_id. This page should only be accessed via an MCP client OAuth flow.")
        setLoading(false)
        return
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser()

      // #region agent log
      serverLog("auth check", { hasUser: !!currentUser, userId: currentUser?.id }, "H3")
      // #endregion

      if (!currentUser) {
        const returnUrl = window.location.href
        window.location.href = `/auth?next=${encodeURIComponent(returnUrl)}`
        return
      }

      setUser(currentUser)

      // Fetch authorization details using Supabase OAuth API
      const { data: details, error: detailsError } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorizationId)

      // #region agent log
      serverLog("getAuthorizationDetails result", {
        hasDetails: !!details,
        clientName: details?.client?.name,
        scope: details?.scope,
        error: detailsError?.message,
      }, "H2")
      // #endregion

      if (detailsError || !details) {
        setError(detailsError?.message || "Could not load authorization details")
        setLoading(false)
        return
      }

      setAuthDetails(details)
      setLoading(false)
    }

    init()
  }, [authorizationId])

  const handleApprove = async () => {
    if (!authorizationId) return
    setApproving(true)

    // #region agent log
    serverLog("approve clicked", { authorizationId, clientName: authDetails?.client?.name }, "H2")
    // #endregion

    const { data, error: approveError } = await (supabase.auth as any).oauth.approveAuthorization(authorizationId)

    // #region agent log
    serverLog("approveAuthorization result", { redirectTo: data?.redirect_to, error: approveError?.message }, "H2")
    // #endregion

    if (approveError || !data?.redirect_to) {
      setError(approveError?.message || "Approval failed")
      setApproving(false)
      return
    }

    window.location.href = data.redirect_to
  }

  const handleDeny = async () => {
    if (!authorizationId) return

    // #region agent log
    serverLog("deny clicked", { authorizationId }, "H2")
    // #endregion

    const { data, error: denyError } = await (supabase.auth as any).oauth.denyAuthorization(authorizationId)

    if (denyError || !data?.redirect_to) {
      setError(denyError?.message || "Denial failed")
      return
    }

    window.location.href = data.redirect_to
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Authorization Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  const scopes = authDetails?.scope?.split(" ").filter(Boolean) || []

  const scopeDescriptions: Record<string, string> = {
    read: "View your inventory, shopping list, recipes, and waste analytics",
    write: "Add or modify inventory items, shopping list, and recipes",
    openid: "Verify your identity",
    profile: "Access your profile information",
    email: "Access your email address",
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Shield className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle className="text-xl">Authorize AI Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            <strong>{authDetails?.client?.name || "An AI assistant"}</strong> wants to access your Kitchen Inventory data as{" "}
            <strong>{user?.email}</strong>.
          </p>

          {scopes.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions requested</p>
              {scopes.map((s: string) => (
                <div key={s} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-sm">{scopeDescriptions[s] || s}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              You can revoke access at any time from Profile Settings.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleDeny} disabled={approving}>
            <XCircle className="mr-1.5 h-4 w-4" />
            Deny
          </Button>
          <Button className="flex-1" onClick={handleApprove} disabled={approving}>
            {approving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1.5 h-4 w-4" />}
            Approve
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AuthorizeInner />
    </Suspense>
  )
}
