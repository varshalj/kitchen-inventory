-- Voice agent session logging (Slice 1).
-- See docs/decisions.md ADR 008 for rationale: transcripts + tool calls +
-- timings only — no audio. Behind an admin-controlled toggle.

-- 1. Admin toggle on the existing feature_grants table.
-- Default off; admin enables per user via Supabase dashboard.
alter table public.feature_grants
  add column if not exists voice_logs_enabled boolean not null default false;

-- 2. Per-turn log table.
-- One row per "turn" — a user transcript, an agent response, a tool call,
-- or a system message. Normalized for easier analysis later.
create table if not exists public.voice_session_logs (
  id uuid primary key default gen_random_uuid(),

  -- Whose conversation. RLS-scoped via this column.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Groups all turns from one voice session together. Voice agent assigns
  -- this at session start (typically the RTVI session id or a generated uuid).
  session_id text not null,

  -- Monotonic per-session counter so turns can be ordered without sorting
  -- by created_at (which has millisecond ties under load).
  turn_number integer not null,

  -- Who/what produced this turn:
  --   'user'   = transcript from STT (what the user said)
  --   'agent'  = response from LLM (what Kitchen Mate replied)
  --   'tool'   = a tool call made by the agent (e.g. list_inventory)
  --   'system' = pipeline events worth recording (session start/end, errors)
  role text not null check (role in ('user', 'agent', 'tool', 'system')),

  -- The transcribed/generated text. NULL for tool-only rows where the
  -- interesting payload is in tool_args / tool_result.
  text text,

  -- Tool-call payload (only populated when role='tool')
  tool_name text,
  tool_args jsonb,
  tool_result jsonb,

  -- How long this step took. Useful for latency debugging.
  -- For 'user' turns: STT processing time. For 'agent': LLM round-trip.
  -- For 'tool': tool execution time. For 'system': nullable.
  latency_ms integer,

  -- Which model produced this output (e.g. 'saaras:v3', 'gpt-4o-mini',
  -- 'bulbul:v3'). Helps diagnose model-specific bugs.
  model text,

  created_at timestamptz not null default now()
);

-- Common access pattern: "show me a specific session's turns in order".
create index if not exists idx_voice_session_logs_user_session_turn
  on public.voice_session_logs(user_id, session_id, turn_number);

-- Common analytics pattern: "all sessions for this user, most recent first".
create index if not exists idx_voice_session_logs_user_created
  on public.voice_session_logs(user_id, created_at desc);

-- RLS: users can read their own logs (so a future "voice history" page
-- could exist). Only service-role can insert/update/delete.
alter table public.voice_session_logs enable row level security;

create policy "Users can read own voice session logs"
  on public.voice_session_logs
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies = denied by default for authenticated
-- users. Modal voice agent connects with service-role for writes.

-- Comment for future maintainers / data exploration tools.
comment on table public.voice_session_logs is
  'Per-turn voice agent session log — text only, no audio. See docs/decisions.md ADR 008.';
