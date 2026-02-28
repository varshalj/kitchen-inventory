import type { NextRequest } from "next/server"

export function getOwnerEmail(request: NextRequest): string {
  return request.headers.get("x-beta-user-email") ?? request.nextUrl.searchParams.get("userEmail") ?? "demo-beta@kitchen.app"
}
