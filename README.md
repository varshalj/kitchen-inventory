# Kitchen Inventory

Track your kitchen inventory, reduce food waste, and get AI-powered meal suggestions.

## Features

- Inventory tracking with expiry date monitoring
- AI-powered item scanning (photo of groceries/receipts)
- AI meal plan generation based on available ingredients
- Shopping list management
- Waste analytics and insights
- Google OAuth and magic link authentication

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL + Row Level Security)
- **Auth:** Supabase Auth (OAuth, magic link)
- **AI:** OpenAI GPT-4o-mini (vision + text)
- **UI:** Tailwind CSS 4, shadcn/ui, Radix UI
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- A Supabase project
- An OpenAI API key (for AI features)

### Setup

1. Clone the repo and install dependencies:

```bash
pnpm install
```

2. Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

3. Run the Supabase migrations against your project:

```bash
# Apply migrations via the Supabase dashboard SQL editor, or using the CLI:
supabase db push
```

4. Start the dev server:

```bash
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `OPENAI_API_KEY` | For AI | OpenAI API key for scan and meal plan features |
| `KMS_MASTER_KEY` | For key vault | Encryption key for user-provided API keys |

## Deployment (Vercel)

1. Connect the GitHub repo to Vercel
2. Set the environment variables in the Vercel dashboard (Settings > Environment Variables)
3. Deploy -- Vercel auto-detects the Next.js framework

## Database Migrations

Migration files are in `supabase/migrations/`. Apply them in order:

1. `202602270001_base_tables_and_beta_seed.sql` -- creates tables
2. `20260227170000_add_user_rls_and_indexes.sql` -- adds RLS policies
3. `202603010002_migrate_to_user_id.sql` -- migrates to user_id ownership

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run linter |
