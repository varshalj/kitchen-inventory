import { NextRequest, NextResponse } from "next/server"
import { appendFileSync } from "fs"
import { join } from "path"

const LOG_PATH = join(process.cwd(), ".cursor", "debug.log")

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const line = JSON.stringify({ ...body, serverTimestamp: Date.now() }) + "\n"
    appendFileSync(LOG_PATH, line)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
