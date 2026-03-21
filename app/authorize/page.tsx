"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, CheckCircle, XCircle, Loader2 } from "lucide-react"

function AuthorizeInner() {
  const searchParams = useSearchParams()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  const clientId = searchParams.get("client_id")
  const redirectUri = searchParams.get("redirect_uri")
  const responseType = searchParams.get("response_type")
  const state = searchParams.get("state")
  const codeChallenge = searchParams.get("code_challenge")
  const codeChallengeMethod = searchParams.get("code_challenge_method")
  const scope = searchParams.get("scope")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      if (data?.user) {
        setUser(data.user)
      }
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    const returnUrl = typeof window !== "undefined" ? window.location.href : "/authorize"
    const loginUrl = `/auth?next=${encodeURIComponent(returnUrl)}`

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-primary mx-auto mb-2" />
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Sign in to your Kitchen Inventory account to authorize AI assistant access.
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => (window.location.href = loginUrl)}>
              Sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const handleApprove = async () => {
    setApproving(true)

    const params = new URLSearchParams()
    if (clientId) params.set("client_id", clientId)
    if (redirectUri) params.set("redirect_uri", redirectUri)
    if (responseType) params.set("response_type", responseType)
    if (state) params.set("state", state)
    if (codeChallenge) params.set("code_challenge", codeChallenge)
    if (codeChallengeMethod) params.set("code_challenge_method", codeChallengeMethod)
    if (scope) params.set("scope", scope)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    window.location.href = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`
  }

  const handleDeny = () => {
    if (redirectUri) {
      const url = new URL(redirectUri)
      url.searchParams.set("error", "access_denied")
      if (state) url.searchParams.set("state", state)
      window.location.href = url.toString()
    } else {
      window.close()
    }
  }

  const scopes = scope?.split(" ").filter(Boolean) || ["read"]

  const scopeDescriptions: Record<string, string> = {
    read: "View your inventory, shopping list, recipes, and waste analytics",
    write: "Add or modify inventory items, shopping list, and recipes",
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
            An AI assistant wants to access your Kitchen Inventory data as <strong>{user.email}</strong>.
          </p>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions requested</p>
            {scopes.map((s) => (
              <div key={s} className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-sm">{scopeDescriptions[s] || s}</span>
              </div>
            ))}
          </div>

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
