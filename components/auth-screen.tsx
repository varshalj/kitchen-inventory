"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MainLayout } from "@/components/main-layout"
import { supabase } from "@/lib/supabase-client"

export function AuthScreen() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [isLoadingEmail, setIsLoadingEmail] = useState(false)
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nextPath, setNextPath] = useState("/dashboard")

  useEffect(() => {
    const requestedNext = new URLSearchParams(window.location.search).get("next")
    if (requestedNext && requestedNext.startsWith("/")) {
      setNextPath(requestedNext)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (data.session) {
        router.replace(nextPath)
      }
    })
  }, [router, nextPath])

const handleMagicLinkSignIn = async () => {
  if (!email.trim()) {
    setError("Please enter an email address.")
    return
  }

  setIsLoadingEmail(true)
  setError(null)
  setMessage(null)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${location.origin}${nextPath}`,
    },
  })

  if (error) {
    setError(error.message)
  } else {
    setMessage("Check your email for the magic link.")
  }

  setIsLoadingEmail(false)
}

const handleGoogleSignIn = async () => {
  setIsLoadingGoogle(true)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}${nextPath}`,
    },
  })

  if (error) {
    setError(error.message)
    setIsLoadingGoogle(false)
  }
}

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-[80vh]">
        <div className="w-full max-w-sm mx-auto text-center">
          <div className="mb-8">
            <div className="inline-block p-4 rounded-full bg-primary/10 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-10 w-10 text-primary"
              >
                <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                <line x1="6" x2="18" y1="17" y2="17" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold">Kitchen Inventory</h1>
            <p className="text-muted-foreground mt-2">Use a magic link to sign in. Google OAuth is optional.</p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isLoadingEmail || isLoadingGoogle}
            />
            <Button onClick={handleMagicLinkSignIn} disabled={isLoadingEmail || isLoadingGoogle} className="w-full">
              {isLoadingEmail ? "Sending magic link..." : "Send magic link"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoadingEmail || isLoadingGoogle}
            >
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
