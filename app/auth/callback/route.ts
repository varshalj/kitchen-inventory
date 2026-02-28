import { NextResponse, type NextRequest } from "next/server"
import { authCookieNames, requestSupabaseAuth, supabaseUrl } from "@/lib/supabase"

type SupabaseSession = {
  access_token: string
  refresh_token: string
  expires_in: number
}

function getSafeRedirect(target: string | null) {
  if (!target || !target.startsWith("/")) {
    return "/dashboard"
  }

  return target
}

export async function GET(request: NextRequest) {
  if (!supabaseUrl) {
    return NextResponse.redirect(new URL("/auth?error=config_missing", request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")
  const redirectTarget = getSafeRedirect(url.searchParams.get("next"))

  try {
    let session: SupabaseSession | null = null

    if (code) {
      session = await requestSupabaseAuth<SupabaseSession>("/token?grant_type=authorization_code", {
        method: "POST",
        body: JSON.stringify({
          code,
          redirect_uri: `${url.origin}/auth/callback`,
        }),
      })
    } else if (tokenHash && type) {
      session = await requestSupabaseAuth<SupabaseSession>("/verify", {
        method: "POST",
        body: JSON.stringify({
          token_hash: tokenHash,
          type,
        }),
      })
    }

    if (!session?.access_token || !session?.refresh_token) {
      return NextResponse.redirect(new URL("/auth?error=missing_session", request.url))
    }

    const response = NextResponse.redirect(new URL(redirectTarget, request.url))

    response.cookies.set(authCookieNames.accessToken, session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.expires_in,
    })

    response.cookies.set(authCookieNames.refreshToken, session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch {
    return NextResponse.redirect(new URL("/auth?error=callback_failed", request.url))
  }
}
