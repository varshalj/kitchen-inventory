"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CookingPot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
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
              <CookingPot className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Kitchen Inventory</h1>
            <p className="text-muted-foreground mt-2">Sign in to manage your kitchen</p>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
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
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={isLoadingEmail || isLoadingGoogle}
              >
                {isLoadingGoogle ? "Redirecting..." : "Continue with Google"}
              </Button>

              {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
