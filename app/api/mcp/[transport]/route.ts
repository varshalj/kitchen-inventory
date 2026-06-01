import { authenticateMcpRequest } from "@/lib/mcp/auth"
import { handleToolCall } from "@/lib/mcp/tools"
import type { SupabaseClient } from "@supabase/supabase-js"

const PROTOCOL_VERSION = "2024-11-05"
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"

// Reusable JSON-Schema fragments for outputSchema declarations.
const SHOPPING_ITEM_OUTPUT = {
  type: "object",
  required: ["id", "name", "quantity"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    completed: { type: "boolean" },
  },
}

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
  {
    name: "add_to_shopping_list",
    title: "Add To Shopping List",
    description:
      "Add an item to the user's shopping list. Names are matched with case- and plural-insensitive normalization (e.g. 'Almond' and 'almonds' collapse). If a non-completed item with the same normalized name AND same unit exists, the call merges quantities; a different unit creates a separate row. Tagged with addedFrom='agent'. SAFETY: defaults to dry-run (confirm:false) — first call returns a preview of what would change; the caller must repeat the call with confirm:true to execute.",
    inputSchema: {
      type: "object",
      required: ["item_name"],
      properties: {
        item_name: { type: "string", description: "Name of the item to add (case-insensitive, naive singular/plural collapse)" },
        quantity: { type: "number", description: "Quantity to add (default 1)" },
        unit: { type: "string", description: "Unit (e.g. 'cartons', 'lbs')" },
        confirm: {
          type: "boolean",
          description: "Must be true to execute. Default false returns a dry-run preview; repeat with confirm:true after the user agrees.",
        },
      },
    },
    outputSchema: {
      type: "object",
      description: "Either an executed result (ok:true) or a dry-run preview (dry_run:true). Errors are returned with isError:true and described in the content text.",
      oneOf: [
        {
          title: "Executed",
          required: ["ok", "merged", "item"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            merged: { type: "boolean", description: "True iff the call added quantity to a pre-existing pending row." },
            previous_quantity: { type: "number", description: "Quantity before merge. Present only when merged:true." },
            item: SHOPPING_ITEM_OUTPUT,
          },
        },
        {
          title: "DryRun",
          required: ["dry_run", "tool", "would", "next_step"],
          properties: {
            dry_run: { type: "boolean", enum: [true] },
            tool: { type: "string", enum: ["add_to_shopping_list"] },
            would: {
              type: "object",
              required: ["action"],
              properties: {
                action: { type: "string", enum: ["merge_with_existing", "insert_new"] },
                existing: SHOPPING_ITEM_OUTPUT,
                new_quantity: { type: "number" },
                item: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                  },
                },
              },
            },
            next_step: { type: "string" },
          },
        },
      ],
    },
  },
  {
    name: "mark_as_consumed",
    title: "Mark As Consumed",
    description:
      "Archive an active inventory item as consumed (full archive — no partial decrement in v1) and add it back to the shopping list. Accepts item_id (direct id lookup, used after disambiguation) OR item_name (normalized match). 0 active name matches → isError 'not_found'; 2+ active name matches → isError 'ambiguous' with a candidates list (each has an id); the caller should ask the user which one and retry with that id via the item_id arg. SAFETY: defaults to dry-run (confirm:false) — first call returns a preview; repeat with confirm:true to execute.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "Direct lookup by inventory item id (UUID). Preferred when resolving an earlier ambiguous response — use one of the candidate ids returned in that error.",
        },
        item_name: { type: "string", description: "Name of the inventory item to mark consumed (normalized match). Use when you don't have an id." },
        quantity: {
          type: "number",
          description: "Quantity to put on the shopping list (defaults to the item's current inventory quantity)",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to execute. Default false returns a dry-run preview.",
        },
      },
    },
    outputSchema: {
      type: "object",
      description: "Either an executed result or a dry-run preview. Errors (not_found, ambiguous) are returned with isError:true.",
      oneOf: [
        {
          title: "Executed",
          required: ["ok", "consumed", "restocked"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            consumed: {
              type: "object",
              required: ["id", "name"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                consumed_on: { type: "string", description: "ISO-8601 timestamp" },
              },
            },
            restocked: {
              type: "object",
              required: ["id", "name", "quantity"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                added_from: { type: "string", enum: ["consumed"] },
              },
            },
          },
        },
        {
          title: "DryRun",
          required: ["dry_run", "tool", "would", "next_step"],
          properties: {
            dry_run: { type: "boolean", enum: [true] },
            tool: { type: "string", enum: ["mark_as_consumed"] },
            would: {
              type: "object",
              required: ["action", "consume", "restock"],
              properties: {
                action: { type: "string", enum: ["archive_and_restock"] },
                consume: {
                  type: "object",
                  required: ["id", "name"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    brand: { type: "string" },
                    expiry_date: { type: "string" },
                  },
                },
                restock: {
                  type: "object",
                  required: ["quantity"],
                  properties: {
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    added_from: { type: "string", enum: ["consumed"] },
                  },
                },
              },
            },
            next_step: { type: "string" },
          },
        },
      ],
    },
  },
  {
    name: "remove_from_shopping_list",
    title: "Remove From Shopping List",
    description:
      "Delete an item from the shopping list. Pass item_id (preferred — get it from list_shopping or a prior add response) OR item_name (normalized lookup; refuses with isError 'ambiguous' if multiple active items match). SAFETY: defaults to dry-run; repeat with confirm:true to execute. Use this to undo agent overreach.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "Exact shopping item id (preferred, from list_shopping)" },
        item_name: { type: "string", description: "Name of the shopping item (normalized match). Ignored if item_id is provided." },
        confirm: {
          type: "boolean",
          description: "Must be true to execute. Default false returns a dry-run preview.",
        },
      },
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          title: "Executed",
          required: ["ok", "removed"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            removed: SHOPPING_ITEM_OUTPUT,
          },
        },
        {
          title: "DryRun",
          required: ["dry_run", "tool", "would", "next_step"],
          properties: {
            dry_run: { type: "boolean", enum: [true] },
            tool: { type: "string", enum: ["remove_from_shopping_list"] },
            would: {
              type: "object",
              required: ["action", "item"],
              properties: {
                action: { type: "string", enum: ["delete"] },
                item: SHOPPING_ITEM_OUTPUT,
              },
            },
            next_step: { type: "string" },
          },
        },
      ],
    },
  },
  {
    name: "update_shopping_item",
    title: "Update Shopping Item",
    description:
      "Update a shopping list item's quantity, unit, completed status, or notes. Pass item_id (preferred) OR item_name. At least one of quantity/unit/completed/notes is required. SAFETY: defaults to dry-run, which returns a from→to diff; repeat with confirm:true to execute.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "Exact shopping item id (preferred)" },
        item_name: { type: "string", description: "Name of the shopping item (normalized match). Ignored if item_id is provided." },
        quantity: { type: "number", description: "New quantity (>= 0)" },
        unit: { type: "string", description: "New unit" },
        completed: { type: "boolean", description: "Set to true to mark the item as bought / done" },
        notes: { type: "string", description: "Replace the notes string" },
        confirm: {
          type: "boolean",
          description: "Must be true to execute. Default false returns a dry-run preview.",
        },
      },
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          title: "Executed",
          required: ["ok", "updated"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            updated: {
              type: "object",
              required: ["id", "name"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                completed: { type: "boolean" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          title: "DryRun",
          required: ["dry_run", "tool", "would", "next_step"],
          properties: {
            dry_run: { type: "boolean", enum: [true] },
            tool: { type: "string", enum: ["update_shopping_item"] },
            would: {
              type: "object",
              required: ["action", "item", "changes"],
              properties: {
                action: { type: "string", enum: ["update"] },
                item: {
                  type: "object",
                  required: ["id", "name"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                  },
                },
                changes: {
                  type: "object",
                  description: "Per-field diff. Keys are field names; values are {from, to} pairs.",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      from: {},
                      to: {},
                    },
                  },
                },
              },
            },
            next_step: { type: "string" },
          },
        },
      ],
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
