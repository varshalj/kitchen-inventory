"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MainLayout } from "@/components/main-layout"
import { useAuthUser } from "@/hooks/use-auth-user"

export function AuthScreen() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuthUser()

  const nextPath = searchParams.get("next")

    // Simulate authentication
    setTimeout(() => {
      signIn()
      setIsLoading(false)
      router.push("/dashboard")
    }, 1500)
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
