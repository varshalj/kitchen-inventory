import { NextRequest, NextResponse } from "next/server"
import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { recipeImportRepo } from "@/lib/server/repositories/recipe-repo"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseFromRequest()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!["deleted"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Verify ownership before updating
    const { data: row } = await supabase
      .from("recipe_imports")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await recipeImportRepo.updateStatus(supabase, id, status)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("IMPORT PATCH ERROR:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
