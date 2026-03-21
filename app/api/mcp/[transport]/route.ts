import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"
import { authenticateMcpRequest } from "@/lib/mcp/auth"
import { handleToolCall } from "@/lib/mcp/tools"
import type { SupabaseClient } from "@supabase/supabase-js"

function getSupabase(extra: any): SupabaseClient | null {
  const authInfo = extra?.authInfo as AuthInfo | undefined
  return (authInfo?.extra as any)?.supabase ?? null
}

function errResult(msg: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true as const }
}

async function callTool(name: string, args: Record<string, unknown>, extra: any) {
  const supabase = getSupabase(extra)
  if (!supabase) return errResult("Authentication required")
  try {
    return await handleToolCall(name, args, supabase)
  } catch (e: any) {
    return errResult(e.message)
  }
}

// Zod 4 (3.25.x) types differ from Zod 3's ZodType expected by mcp-handler.
// Schemas work at runtime; cast to satisfy the type checker.
const str = () => z.string() as any
const strOpt = () => z.string().optional() as any
const numOpt = () => z.number().optional() as any

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_inventory",
      {
        title: "List Inventory",
        description:
          "List current (non-archived) inventory items. Optional filters: category (e.g. dairy, vegetables), location (e.g. fridge, pantry).",
        inputSchema: { category: strOpt(), location: strOpt() },
      },
      async (args: any, extra) => callTool("list_inventory", args, extra),
    )

    server.registerTool(
      "get_expiring_soon",
      {
        title: "Get Expiring Soon",
        description: "Get inventory items expiring within N days (default 3). Useful for preventing food waste.",
        inputSchema: { days: numOpt() },
      },
      async (args: any, extra) => callTool("get_expiring_soon", args, extra),
    )

    server.registerTool(
      "list_shopping",
      {
        title: "List Shopping",
        description: "List shopping list items. Filter by status: pending (default), completed, or all.",
        inputSchema: { status: strOpt() },
      },
      async (args: any, extra) => callTool("list_shopping", args, extra),
    )

    server.registerTool(
      "list_recipes",
      {
        title: "List Recipes",
        description: "List saved recipes with title, source, servings, prep/cook time, and pantry compatibility score.",
        inputSchema: {},
      },
      async (_args: any, extra) => callTool("list_recipes", {}, extra),
    )

    server.registerTool(
      "get_recipe",
      {
        title: "Get Recipe",
        description: "Get a single recipe with full ingredients list and instructions. Requires recipe_id.",
        inputSchema: { recipe_id: str() },
      },
      async (args: any, extra) => callTool("get_recipe", args, extra),
    )

    server.registerTool(
      "suggest_meals",
      {
        title: "Suggest Meals",
        description: "Suggest recipes sorted by pantry compatibility score (highest first). Optional limit (default 5).",
        inputSchema: { limit: numOpt() },
      },
      async (args: any, extra) => callTool("suggest_meals", args, extra),
    )

    server.registerTool(
      "get_waste_stats",
      {
        title: "Get Waste Stats",
        description: "Get food waste analytics: total items wasted, breakdown by category and reason. Optional days lookback (default 30).",
        inputSchema: { days: numOpt() },
      },
      async (args: any, extra) => callTool("get_waste_stats", args, extra),
    )

    server.registerTool(
      "search_inventory",
      {
        title: "Search Inventory",
        description: "Fuzzy search inventory items by name across current and archived items. Requires query string.",
        inputSchema: { query: str() },
      },
      async (args: any, extra) => callTool("search_inventory", args, extra),
    )
  },
  {},
  {
    basePath: "/api/mcp",
    maxDuration: 60,
  },
)

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined

  try {
    const { supabase, userId, userEmail } = await authenticateMcpRequest(
      `Bearer ${bearerToken}`,
    )

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

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
