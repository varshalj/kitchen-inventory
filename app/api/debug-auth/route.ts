import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const supabase = createSupabaseFromRequest(request)

  if (!supabase) {
    return NextResponse.json({
      hasSupabase: false,
      authHeader: request.headers.get("authorization"),
    })
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return NextResponse.json({
    hasSupabase: true,
    authHeader: request.headers.get("authorization"),
    user,
    error,
  })
}
