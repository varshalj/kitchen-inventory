/**
 * Minimal MCP JSON-RPC 2.0 client for calling Swiggy Instamart tools on
 * behalf of an authenticated end-user.
 *
 * The Swiggy MCP exposes three product servers; we only target Instamart
 * here (mcp.swiggy.com/im). Food and Dineout would be separate clients.
 */

import { touchLastUsed } from "./token-store"

const SWIGGY_INSTAMART_MCP_URL = "https://mcp.swiggy.com/im"

export class SwiggyMcpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: number | null,
    public readonly data: unknown,
  ) {
    super(message)
    this.name = "SwiggyMcpError"
  }
}

export type ToolCallResult = {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
  structuredContent?: unknown
  isError?: boolean
}

/**
 * Call a single Swiggy MCP tool. Throws SwiggyMcpError with status=401 when
 * the user's token is expired/revoked so callers can prompt re-auth.
 */
export async function callSwiggyTool(params: {
  userId: string
  accessToken: string
  toolName: string
  args: Record<string, unknown>
}): Promise<ToolCallResult> {
  const requestBody = {
    jsonrpc: "2.0",
    id: cryptoRandomId(),
    method: "tools/call",
    params: {
      name: params.toolName,
      arguments: params.args,
    },
  }

  const response = await fetch(SWIGGY_INSTAMART_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (response.status === 401) {
    throw new SwiggyMcpError(
      "Swiggy access token rejected — user must re-authenticate.",
      401,
      null,
      null,
    )
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new SwiggyMcpError(
      `Swiggy MCP HTTP ${response.status}: ${text.slice(0, 200)}`,
      response.status,
      null,
      null,
    )
  }

  const payload = (await response.json()) as {
    result?: ToolCallResult
    error?: { code: number; message: string; data?: unknown }
  }

  if (payload.error) {
    throw new SwiggyMcpError(
      `Swiggy MCP JSON-RPC error: ${payload.error.message}`,
      null,
      payload.error.code,
      payload.error.data,
    )
  }
  if (!payload.result) {
    throw new SwiggyMcpError("Swiggy MCP returned no result", null, null, null)
  }

  // Best-effort: bump last_used_at. Failures don't propagate.
  void touchLastUsed(params.userId)

  return payload.result
}

// ─── Typed convenience wrappers for the Instamart tools we use ───────────────

export async function getAddresses(params: { userId: string; accessToken: string }) {
  return callSwiggyTool({
    ...params,
    toolName: "get_addresses",
    args: {},
  })
}

export async function getCart(params: { userId: string; accessToken: string }) {
  return callSwiggyTool({
    ...params,
    toolName: "get_cart",
    args: {},
  })
}

export async function searchProducts(params: {
  userId: string
  accessToken: string
  query: string
}) {
  return callSwiggyTool({
    ...params,
    toolName: "search_products",
    args: { query: params.query },
  })
}

export async function updateCart(params: {
  userId: string
  accessToken: string
  items: Array<{ product_id: string; quantity: number }>
}) {
  return callSwiggyTool({
    ...params,
    toolName: "update_cart",
    args: { items: params.items },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cryptoRandomId(): string {
  // crypto.randomUUID() is available in Node 19+ and edge runtimes.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
