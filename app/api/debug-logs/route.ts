// Temporary debug endpoint — remove after verification
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    message: "Logs are stored in browser localStorage under key '_dbg'. Open browser console on the device and run: JSON.parse(localStorage.getItem('_dbg') || '[]')",
  })
}
