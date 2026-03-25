import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let token = ""
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const b of bytes) {
    token += chars[b % chars.length]
  }
  return token
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await (supabase as any)
      .from("user_settings")
      .select("email_forwarding_token")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") throw error

    return NextResponse.json({ token: data?.email_forwarding_token ?? null })
  } catch (error) {
    console.error("GET /api/email-forwarding-token error:", error)
    return NextResponse.json({ error: "Failed to load token" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = generateToken()

    const { error } = await (supabase as any)
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          email_forwarding_token: token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (error) {
      if (error.code === "23505") {
        // Unique constraint collision on token — retry once
        const retryToken = generateToken()
        const { error: retryError } = await (supabase as any)
          .from("user_settings")
          .upsert(
            {
              user_id: user.id,
              email_forwarding_token: retryToken,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          )
        if (retryError) throw retryError
        return NextResponse.json({ token: retryToken })
      }
      throw error
    }

    return NextResponse.json({ token })
  } catch (error) {
    console.error("POST /api/email-forwarding-token error:", error)
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 })
  }
}
