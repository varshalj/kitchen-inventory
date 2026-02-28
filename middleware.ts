import { NextResponse, type NextRequest } from "next/server"
import { authCookieNames, supabaseAnonKey, supabaseUrl } from "@/lib/supabase"

const protectedRoutes = [
  "/dashboard",
  "/add-item",
  "/analytics",
  "/profile",
  "/shopping-list",
  "/archived",
  "/search",
]

function isProtectedPath(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

async function isAuthenticated(request: NextRequest) {
  const accessToken = request.cookies.get(authCookieNames.accessToken)?.value

  if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
    return false
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return userResponse.ok
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const needsAuth = isProtectedPath(pathname) || pathname.startsWith("/api/")

  if (!needsAuth) {
    return NextResponse.next()
  }

  const authenticated = await isAuthenticated(request)

  if (authenticated) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const loginUrl = new URL("/auth", request.url)
  loginUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/dashboard/:path*", "/add-item/:path*", "/analytics/:path*", "/profile/:path*", "/shopping-list/:path*", "/archived/:path*", "/search/:path*", "/api/:path*"],
}
