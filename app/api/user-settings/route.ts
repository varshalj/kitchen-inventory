import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"

export async function GET(_req: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = row not found — treat as empty settings
      throw error
    }

    return NextResponse.json({ settings: data?.settings ?? {} })
  } catch (error) {
    console.error("GET /api/user-settings error:", error)
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.settings !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, settings: body.settings, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("PUT /api/user-settings error:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
