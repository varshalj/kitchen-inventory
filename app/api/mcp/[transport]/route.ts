import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { withMcpAuth } from "mcp-handler"
import { z } from "zod"
import { authenticateMcpRequest } from "@/lib/mcp/auth"
import { handleToolCall } from "@/lib/mcp/tools"
import type { SupabaseClient } from "@supabase/supabase-js"

// Pass pre-built z.object() schemas so the SDK's getZodSchemaObject returns them unchanged
// (skipping the objectFromShape path that uses zod/v3 subpath import — unreliable in prod bundles).
// safeParseAsync then calls the Zod 3 instance method directly, which is guaranteed to work.

function registerAllTools(server: McpServer, supabase: SupabaseClient) {
  const call = async (name: string, args: Record<string, unknown>) => {
    try {
      return await handleToolCall(name, args, supabase)
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: e.message }) }], isError: true as const }
    }
  }

  server.registerTool(
    "list_inventory",
    {
      title: "List Inventory",
      description:
        "List current (non-archived) inventory items. Optional filters: category (e.g. dairy, vegetables), location (e.g. fridge, pantry).",
      inputSchema: z.object({ category: z.string().optional(), location: z.string().optional() }) as any,
    },
    (args: any) => call("list_inventory", args),
  )

  server.registerTool(
    "get_expiring_soon",
    {
      title: "Get Expiring Soon",
      description: "Get inventory items expiring within N days (default 3). Useful for preventing food waste.",
      inputSchema: z.object({ days: z.number().optional() }) as any,
    },
    (args: any) => call("get_expiring_soon", args),
  )

  server.registerTool(
    "list_shopping",
    {
      title: "List Shopping",
      description: "List shopping list items. Filter by status: pending (default), completed, or all.",
      inputSchema: z.object({ status: z.string().optional() }) as any,
    },
    (args: any) => call("list_shopping", args),
  )

  server.registerTool(
    "list_recipes",
    {
      title: "List Recipes",
      description: "List saved recipes with title, source, servings, prep/cook time, and pantry compatibility score.",
      inputSchema: z.object({}) as any,
    },
    () => call("list_recipes", {}),
  )

  server.registerTool(
    "get_recipe",
    {
      title: "Get Recipe",
      description: "Get a single recipe with full ingredients list and instructions. Requires recipe_id.",
      inputSchema: z.object({ recipe_id: z.string() }) as any,
    },
    (args: any) => call("get_recipe", args),
  )

  server.registerTool(
    "suggest_meals",
    {
      title: "Suggest Meals",
      description:
        "Suggest recipes sorted by pantry compatibility score (highest first). Optional limit (default 5).",
      inputSchema: z.object({ limit: z.number().optional() }) as any,
    },
    (args: any) => call("suggest_meals", args),
  )

  server.registerTool(
    "get_waste_stats",
    {
      title: "Get Waste Stats",
      description:
        "Get food waste analytics: total items wasted, breakdown by category and reason. Optional days lookback (default 30).",
      inputSchema: z.object({ days: z.number().optional() }) as any,
    },
    (args: any) => call("get_waste_stats", args),
  )

  server.registerTool(
    "search_inventory",
    {
      title: "Search Inventory",
      description:
        "Fuzzy search inventory items by name across current and archived items. Requires query string.",
      inputSchema: z.object({ query: z.string() }) as any,
    },
    (args: any) => call("search_inventory", args),
  )
}

/**
 * Core MCP handler. Creates a fresh WebStandardStreamableHTTPServerTransport and
 * McpServer per request — required because stateless mode forbids transport reuse.
 */
async function mcpCoreHandler(req: Request): Promise<Response> {
  const authInfo = (req as any).auth as AuthInfo | undefined
  const supabase = (authInfo?.extra as any)?.supabase as SupabaseClient | undefined

  if (!supabase) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Fresh transport + server per request (stateless mode requirement)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  const server = new McpServer(
    { name: "Kitchen Inventory", version: "1.0.0" },
    { capabilities: { tools: {} } },
  )

  registerAllTools(server, supabase)
  await server.connect(transport)

  return transport.handleRequest(req, { authInfo })
}

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  try {
    const { supabase, userId, userEmail } = await authenticateMcpRequest(`Bearer ${bearerToken}`)
    return {
      token: bearerToken,
      scopes: ["read"],
      clientId: userId,
      extra: { supabase, userId, userEmail },
    }
  } catch {
    return undefined
  }
}

const authHandler = withMcpAuth(mcpCoreHandler, verifyToken, {
  required: true,
  requiredScopes: ["read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
