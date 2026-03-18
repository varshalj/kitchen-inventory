import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"

function isUrl(text: string): boolean {
  try {
    const u = new URL(text.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const baseUrl = req.nextUrl.origin
  const { supabase, user } = await requireUser()

  const formData = await req.formData()
  const file = formData.get("image") as File | null
  const url = formData.get("url") as string | null
  const text = formData.get("text") as string | null

  // Priority 1: Image file → inventory scan
  if (file && file.size > 0) {
    if (!user) {
      return NextResponse.redirect(`${baseUrl}/auth?next=/add-item`)
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from("pending_shares")
      .insert({ user_id: user.id, image_data: dataUrl, expires_at: expiresAt })
      .select("id")
      .single()

    if (error || !data) {
      console.error("Failed to store pending share:", error)
      return NextResponse.redirect(`${baseUrl}/add-item`)
    }

    return NextResponse.redirect(`${baseUrl}/add-item?shareId=${data.id}`)
  }

  // Priority 2: URL → recipe import
  const sharedUrl = url?.trim() || (text && isUrl(text) ? text.trim() : null)
  if (sharedUrl) {
    if (!user) {
      return NextResponse.redirect(`${baseUrl}/auth?next=/recipes`)
    }
    return NextResponse.redirect(
      `${baseUrl}/recipes?importUrl=${encodeURIComponent(sharedUrl)}`
    )
  }

  // Priority 3: Plain text → recipe paste-as-text
  if (text?.trim()) {
    if (!user) {
      return NextResponse.redirect(`${baseUrl}/auth?next=/recipes`)
    }
    return NextResponse.redirect(
      `${baseUrl}/recipes?importText=${encodeURIComponent(text.trim())}`
    )
  }

  // Fallback
  return NextResponse.redirect(`${baseUrl}/dashboard`)
}
