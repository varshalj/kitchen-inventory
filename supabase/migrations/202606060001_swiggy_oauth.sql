-- Swiggy MCP OAuth integration tables (Slice 1: local OAuth flow).
--
-- Two tables:
--
--   oauth_clients         — one row per OAuth provider (e.g. "swiggy"). Stores
--                           the client_id (and optionally client_secret) returned
--                           by Dynamic Client Registration (RFC 7591). NOT
--                           per-user; this is application-level credentials.
--                           Service-role only, no RLS read for end-users.
--
--   user_swiggy_tokens    — per-user. Stores the AES-256-GCM-encrypted access
--                           token for each end-user who has connected their
--                           Swiggy account. RLS so users only see their own row.
--
-- See docs.mcp.swiggy.com/builders/docs/start/authenticate/ for the OAuth flow.
-- Refresh tokens are not issued in Swiggy MCP v1.0; access tokens have a 5-day
-- lifetime, and re-authorization is required on expiry (silent within the
-- 30-day idle window).

-- ─── 1. oauth_clients (singleton per provider) ───────────────────────────────

create table if not exists public.oauth_clients (
  provider text primary key,                -- "swiggy"

  -- DCR response fields (RFC 7591 §3.2.1)
  client_id text not null,
  client_secret_ciphertext text,            -- nullable; public clients have no secret
  client_secret_iv text,
  client_secret_auth_tag text,
  client_secret_key_version text,

  -- Echoed back from DCR; useful for diagnostics / regeneration
  redirect_uris text[] not null default '{}',
  scopes text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;
-- No policies defined → Postgres denies all client access. Only the service-role
-- key (server-side) can read or write. Intentional: end-users have no business
-- seeing the app's OAuth client credentials.

-- ─── 2. user_swiggy_tokens (per-user, encrypted) ─────────────────────────────

create table if not exists public.user_swiggy_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- AES-256-GCM encrypted access token (same scheme as lib/server/ai-key-crypto.ts).
  -- We never store the plaintext.
  access_token_ciphertext text not null,
  access_token_iv text not null,
  access_token_auth_tag text not null,
  access_token_key_version text not null,

  -- Metadata about the granted token (not sensitive, kept plaintext for queries).
  token_type text not null default 'Bearer',
  scope text,                                   -- space-separated, e.g. "mcp:tools"
  expires_at timestamptz not null,              -- ~5 days from issuance per Swiggy docs

  -- For UI hint / "last connected from" display.
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_swiggy_tokens enable row level security;

-- Users can SELECT their own row to check connection status.
-- INSERT/UPDATE/DELETE happen via service-role (server routes), not directly
-- from the client, so no write policies — Postgres denies by default.
create policy "Users can read own swiggy token metadata"
  on public.user_swiggy_tokens
  for select
  using (auth.uid() = user_id);

-- Touch updated_at on every write (server-side).
create or replace function public.touch_user_swiggy_tokens_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_swiggy_tokens_updated_at on public.user_swiggy_tokens;
create trigger trg_user_swiggy_tokens_updated_at
  before update on public.user_swiggy_tokens
  for each row
  execute function public.touch_user_swiggy_tokens_updated_at();
