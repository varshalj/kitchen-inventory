import { authenticateMcpRequest } from "@/lib/mcp/auth"
import { handleToolCall } from "@/lib/mcp/tools"
import type { SupabaseClient } from "@supabase/supabase-js"

const PROTOCOL_VERSION = "2024-11-05"
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"

// Plain JSON Schema tool definitions — no Zod anywhere, zero bundling risk.
const TOOL_DEFINITIONS = [
  {
    name: "list_inventory",
    title: "List Inventory",
    description:
      "List current (non-archived) inventory items. Optional filters: category (e.g. dairy, vegetables), location (e.g. fridge, pantry).",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category (e.g. dairy, vegetables)" },
        location: { type: "string", description: "Filter by location (e.g. fridge, pantry)" },
      },
    },
  },
  {
    name: "get_expiring_soon",
    title: "Get Expiring Soon",
    description: "Get inventory items expiring within N days (default 3). Useful for preventing food waste.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look ahead (default 3)" },
      },
    },
  },
  {
    name: "list_shopping",
    title: "List Shopping",
    description: "List shopping list items. Filter by status: pending (default), completed, or all.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "completed", "all"],
          description: "Filter by status (default: pending)",
        },
      },
    },
  },
  {
    name: "list_recipes",
    title: "List Recipes",
    description:
      "List saved recipes with title, source, servings, prep/cook time, and pantry compatibility score.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_recipe",
    title: "Get Recipe",
    description: "Get a single recipe with full ingredients list and instructions. Requires recipe_id.",
    inputSchema: {
      type: "object",
      required: ["recipe_id"],
      properties: {
        recipe_id: { type: "string", description: "The recipe UUID" },
      },
    },
  },
  {
    name: "suggest_meals",
    title: "Suggest Meals",
    description:
      "Suggest recipes sorted by pantry compatibility score (highest first). Optional limit (default 5).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of suggestions (default 5)" },
      },
    },
  },
  {
    name: "get_waste_stats",
    title: "Get Waste Stats",
    description:
      "Get food waste analytics: total items wasted, breakdown by category and reason. Optional days lookback (default 30).",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days to look back (default 30)" },
      },
    },
  },
  {
    name: "search_inventory",
    title: "Search Inventory",
    description:
      "Fuzzy search inventory items by name across current and archived items. Requires query string.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search term" },
      },
    },
  },
]

// ─── Minimal MCP JSON-RPC dispatcher ─────────────────────────────────────────

async function dispatchJsonRpc(msg: any, supabase: SupabaseClient): Promise<any> {
  const { jsonrpc, method, params, id } = msg ?? {}

  // Notifications have no id — acknowledge silently (no response)
  if (id === undefined || id === null) return null

  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result })
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } })

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "Kitchen Inventory", version: "1.0.0" },
      })

    case "tools/list":
      return ok({ tools: TOOL_DEFINITIONS })

    case "tools/call": {
      const toolName: string | undefined = params?.name
      const args: Record<string, unknown> = params?.arguments ?? {}
      if (!toolName) return err(-32602, "Missing tool name")
      try {
        const result = await handleToolCall(toolName, args, supabase)
        return ok(result)
      } catch (e: any) {
        return ok({
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
          isError: true,
        })
      }
    }

    case "ping":
      return ok({})

    default:
      return err(-32601, `Method not found: ${method}`)
  }
}

// ─── Auth helper (returns 401 with WWW-Authenticate on failure) ───────────────

function unauthorizedResponse(resourceBase: string) {
  return new Response(
    JSON.stringify({ error: "Authentication required" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${resourceBase}${RESOURCE_METADATA_PATH}"`,
      },
    },
  )
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handlePost(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization")
  const origin = new URL(req.url).origin

  let supabase: SupabaseClient
  try {
    ;({ supabase } = await authenticateMcpRequest(authHeader))
  } catch {
    return unauthorizedResponse(origin)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const headers = { "Content-Type": "application/json" }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => dispatchJsonRpc(m, supabase)))).filter(
      (r) => r !== null,
    )
    return new Response(JSON.stringify(responses), { headers })
  }

  const result = await dispatchJsonRpc(body, supabase)
  if (result === null) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(result), { headers })
}

async function handleGet(req: Request): Promise<Response> {
  // Stateless mode — no SSE sessions. Return a helpful error so clients know
  // to use POST only (mcp-remote --transport http-only won't hit this).
  const origin = new URL(req.url).origin
  return new Response(
    JSON.stringify({ error: "Use POST for Streamable HTTP (stateless mode)" }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}${RESOURCE_METADATA_PATH}"`,
      },
    },
  )
}

export { handlePost as POST, handleGet as GET }
