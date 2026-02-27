"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MainLayout } from "@/components/main-layout"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase"

export function AuthScreen() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [isLoadingEmail, setIsLoadingEmail] = useState(false)
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nextPath = searchParams.get("next")

  const buildCallbackPath = () => {
    const suffix = nextPath?.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : ""
    return `${window.location.origin}/auth/callback${suffix}`
  }

  const handleMagicLinkSignIn = async () => {
    if (!email) {
      setError("Enter your email to continue.")
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Authentication is not configured. Add Supabase environment variables.")
      return
    }

    setIsLoadingEmail(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          create_user: true,
          options: {
            emailRedirectTo: buildCallbackPath(),
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send magic link.")
      }

      setMessage("Check your email for the sign-in link.")
    } catch {
      setError("Could not send magic link. Please try again.")
    } finally {
      setIsLoadingEmail(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Authentication is not configured. Add Supabase environment variables.")
      return
    }

    setIsLoadingGoogle(true)
    setError(null)

    const oauthUrl = new URL(`${supabaseUrl}/auth/v1/authorize`)
    oauthUrl.searchParams.set("provider", "google")
    oauthUrl.searchParams.set("redirect_to", buildCallbackPath())

    window.location.href = oauthUrl.toString()
  }

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-[80vh]">
        <div className="w-full max-w-sm mx-auto text-center">
          <div className="mb-8">
            <div className="inline-block p-4 rounded-full bg-primary/10 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-primary">
                <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                <line x1="6" x2="18" y1="17" y2="17" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold">Kitchen Inventory</h1>
            <p className="text-muted-foreground mt-2">Use a magic link to sign in. Google OAuth is optional.</p>
          </div>

          <div className="space-y-3">
            <Input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoadingEmail || isLoadingGoogle} />
            <Button onClick={handleMagicLinkSignIn} disabled={isLoadingEmail || isLoadingGoogle} className="w-full">
              {isLoadingEmail ? "Sending magic link..." : "Send magic link"}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isLoadingEmail || isLoadingGoogle}>
              {isLoadingGoogle ? "Redirecting..." : "Continue with Google (optional)"}
            </Button>
            {message ? <p className="text-sm text-green-600">{message}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
