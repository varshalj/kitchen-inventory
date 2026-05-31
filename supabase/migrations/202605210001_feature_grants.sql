-- Admin-controlled feature grants.
--
-- Why a separate table from user_settings: user_settings has RLS that lets
-- users update their own row. Putting a cost-controlled feature flag (like
-- voice agent) on user_settings would let any user enable it themselves,
-- defeating the admin-only requirement. feature_grants is read-only for
-- end-users — only the Supabase service-role (i.e. you, in the dashboard)
-- can flip these flags.
--
-- Add columns here for any future feature that needs admin-controlled
-- enablement (private betas, paid tiers, cost-capped features).

create table if not exists public.feature_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Voice agent (Pipecat + Sarvam + OpenAI pipeline). Default off; admin
  -- enables per user via Supabase dashboard. See docs/decisions.md ADR 003.
  voice_agent_enabled boolean not null default false,

  -- Provenance for "who got access when". Populated manually when granting.
  granted_by_email text,
  granted_at timestamptz,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_grants enable row level security;

-- Users can READ their own grants so the client knows whether to render the
-- voice widget. No write policies are defined — Postgres denies by default,
-- so users cannot insert/update/delete. Only the service-role bypass key
-- (used in Supabase dashboard SQL editor or admin scripts) can write.
create policy "Users can read own feature grants"
  on public.feature_grants
  for select
  using (auth.uid() = user_id);

-- Partial index for the common "is this user granted?" lookup, kept small by
-- only indexing rows where the feature is actually enabled.
create index if not exists idx_feature_grants_voice_enabled
  on public.feature_grants(user_id)
  where voice_agent_enabled = true;

-- Touch updated_at on any write (admin actions through service role).
create or replace function public.touch_feature_grants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_feature_grants_updated_at on public.feature_grants;
create trigger trg_feature_grants_updated_at
  before update on public.feature_grants
  for each row execute function public.touch_feature_grants_updated_at();
