# Kitchen Inventory

**Your kitchen, organised. Cook what you have. Restock what you don't.**

An AI-powered PWA that tracks pantry items and expiry dates, matches imported recipes against what you have, and turns your shopping list into a one-tap grocery order.

**Live:** https://kitchen-inventory-liart.vercel.app

---

## Features

- **Expiry tracking** — inventory sorted by what needs to be used first, with alerts before items go bad
- **AI camera scan** — photograph a receipt or grocery bag; GPT-4o-mini extracts and adds items to inventory
- **Email auto-sync** — forward order confirmation emails (Swiggy, Blinkit, Zepto, BigBasket, Amazon Fresh, and more); items auto-added with expiry estimates
- **Recipe import** — paste a YouTube, Instagram, or blog URL (or raw recipe text); each recipe gets a pantry readiness score showing what you already have
- **Smart shopping list** — built automatically from consumed items and recipe gaps; one-tap redirect to Swiggy, Blinkit, Zepto, and more
- **MCP server** — exposes kitchen data to Claude, ChatGPT, and Cursor via the Model Context Protocol
- **Waste analytics** — tracks what gets wasted and why

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (Google OAuth + magic link) |
| AI | OpenAI GPT-4o-mini (vision + text) |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI, Framer Motion |
| Deployment | Vercel |

---

## MCP Server

Kitchen Inventory exposes an OAuth-protected MCP server at `/api/mcp/[transport]`.

**Tools available:**

| Tool | Description |
|---|---|
| `list_inventory` | List items, filter by category or location |
| `get_expiring_soon` | Items expiring within N days |
| `list_shopping` | Pending or completed shopping items |
| `list_recipes` | Saved recipes with pantry match scores |
| `get_recipe` | Full recipe with ingredients and instructions |
| `suggest_meals` | Recipes ranked by pantry readiness |
| `get_waste_stats` | Waste summary over a given period |
| `search_inventory` | Fuzzy search across current and archived items |

**Connecting from Claude Desktop or Cursor:**

```json
{
  "mcpServers": {
    "kitchen-inventory": {
      "url": "https://kitchen-inventory-liart.vercel.app/api/mcp/sse",
      "headers": {
        "Authorization": "Bearer <your-supabase-jwt>"
      }
    }
  }
}
```

OAuth-protected resource discovery available at `/.well-known/oauth-protected-resource`.

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Supabase project
- OpenAI API key (for AI scan and recipe import)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local
# Fill in your values — see Environment Variables below

# Apply database migrations
supabase db push

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `OPENAI_API_KEY` | For AI features | GPT-4o-mini for scan and recipe import |
| `KMS_MASTER_KEY` | For key vault | Encryption key for per-user API keys |
| `EMAIL_CALLBACK_SECRET` | For email ingestion | Authenticates webhook calls from Relay.app |

---

## Database Migrations

All migrations are in `supabase/migrations/`, applied in order via `supabase db push`.

Key milestones:
- `202602270001` — base tables (inventory, shopping list)
- `20260227170000` — RLS policies and indexes
- `202603110002` — recipe tables
- `202603200002` — user settings and per-user AI key vault
- `202604020001` — email ingestion pipeline

---

## Email Ingestion

Users forward grocery order emails to a unique address in their profile settings. The app parses items via GPT and adds them to inventory. No email account access required.

Supported platforms detected automatically: Swiggy Instamart, Blinkit, Zepto, BigBasket, Amazon Fresh, JioMart, Flipkart, and more.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript type check |
| `pnpm lint` | Lint |

---

Built by [Varshal Jain](mailto:varshaljain@gmail.com)
