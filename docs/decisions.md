# Architecture decisions — voice agent project

Living log of decisions made during the voice-AI exploration. Each entry includes context, decision, rationale, and conditions under which we'd revisit. **Append new decisions; don't edit historical entries — supersede them with a new ADR instead.** This keeps the history of *why* we changed our minds.

Format follows the ADR (Architecture Decision Record) pattern.

---

## ADR 001 — Voice agent framework: Pipecat

**Date:** 2026-05-21
**Status:** Accepted

### Context

Building a real-time voice agent for Kitchen Inventory. Need a framework that handles the STT → LLM → TTS pipeline with provider-swap flexibility. Likely future state: migrate from English-only providers to Sarvam (Indian language support, lower cost). Don't want to rebuild the orchestration layer when that happens.

### Decision

Use **Pipecat** (by Daily.co) as the voice agent framework.

### Rationale

- First-class plugin support for both **OpenAI Realtime** AND **Sarvam** — the framework is specifically built for provider mixing
- Pipeline abstraction (STT → LLM → TTS as composable stages) maps cleanly onto Sarvam's modular API design, minimizing impedance mismatch on migration
- Active development, growing ecosystem of AI voice providers
- Mixed pipelines (different providers per stage) work out of the box — see ADR 003

### Alternatives considered

- **LiveKit Agents:** Better Node SDK story (we're in a JS-heavy stack), more mature transport layer for production scale. But Sarvam support requires custom plugin work; OpenAI Realtime support is built in. Since Sarvam is the migration destination, picking the framework that *doesn't* support it native is the wrong bet.
- **Direct OpenAI Realtime WebSocket integration (no framework):** Fastest MVP (~200 LOC), but locks us to OpenAI and requires a full rewrite when migrating to Sarvam. The whole reason to use a framework is the swap.
- **Hand-rolled orchestration:** Same problem as direct integration, plus reinventing VAD, interruption handling, etc.

### Revisit when

- LiveKit ships first-class Sarvam plugins (would re-tip the balance toward LiveKit + Node)
- Pipecat's deployment story (Python service) creates ongoing operational pain
- Voice UX research shows we need video / multimodal at scale — LiveKit becomes the right answer

---

## ADR 002 — Python service host: Modal

**Date:** 2026-05-21
**Status:** Accepted

### Context

Pipecat requires a Python runtime. Main Kitchen Inventory app is Next.js on Vercel. Voice sessions are long-lived WebSocket connections (5+ minutes), not request/response. Need a host that supports persistent connections and aligns with the "research project, not production launch" cost model.

### Decision

Deploy Pipecat as a **Modal** function.

### Rationale

- Pay-per-second compute: idle = ~free (matches bursty exploration usage)
- Built for AI/ML workloads — WebSocket and long-running connections are native
- Sub-second cold starts on CPU configs (voice agent is CPU-only)
- Already in use for another project — no new vendor / tooling overhead
- Cleaner separation of concerns: Vercel for Next.js UI + REST; Modal for the voice pipeline

### Alternatives considered

- **Vercel Python functions:** Wrong execution model — short-lived (10s Hobby / 60s Pro); voice sessions can run minutes. Vercel doesn't excel at persistent WebSocket workloads.
- **Railway / Fly.io / Render:** Always-on instances at ~₹400/month. Better if voice usage becomes constant; worse for exploration phase (paying for idle).
- **AWS Lambda + API Gateway WebSocket:** Possible but operationally heavier; ties us to AWS tooling.

### Revisit when

- Voice usage becomes constant enough that flat-rate hosts (Railway/Fly) beat Modal's per-second pricing on monthly cost (rough crossover: >2 hours/day sustained voice traffic)
- Modal's free tier limits are exceeded by exploration usage
- We need to colocate voice with other latency-sensitive services already on a different host

---

## ADR 003 — Voice pipeline: mixed Sarvam + OpenAI

**Date:** 2026-05-21
**Status:** Accepted

### Context

Two voice providers under consideration:
- **OpenAI Realtime API**: monolithic (STT+LLM+TTS in one model), English-strong, ~$3/10 min (~₹250/10min), native voice UX (prosody, interruption, audio-aware reasoning).
- **Sarvam**: modular (3 separate REST APIs — Saarika STT, chat completion, Bulbul TTS), Indian-language strong (10+ Indian languages + English), ~₹35/10min, more transactional UX.

User base is India-based. Vocabulary includes mixed English + Hindi grocery terms (atta, dal, mishri, ghee). Function calling reliability is critical (it's how the agent executes actions).

### Decision

**Mixed pipeline from day 1**, no automatic fallback:

| Stage | Provider | Model |
|---|---|---|
| STT (speech → text) | Sarvam | Saarika |
| LLM (text → text + tool calls) | OpenAI | GPT-4o-mini |
| TTS (text → speech) | Sarvam | Bulbul (voice: Priya or similar) |

### Rationale

- **Sarvam STT** gives us strong Indian-accent + Hindi/Hinglish coverage on input — most important for our actual users
- **OpenAI LLM** gives us proven function-calling reliability — this is the riskiest dependency, and tool execution is *how* the agent does work. Don't compromise here.
- **Sarvam TTS** gives us natural-sounding Indian voices, low cost, fast (~150ms latency)
- Total cost: ~₹2.5/min (~₹25/10min) — roughly **10x cheaper** than pure OpenAI Realtime
- Pipecat's pipeline abstraction makes mixing providers per stage a configuration concern, not an engineering one

### Alternatives considered

- **Pure OpenAI Realtime:** Best UX (native voice model, prosody, interruption handling), highest cost (~₹250/10min), weak Indian-language coverage. Defer until we have evidence the mixed-pipeline UX is insufficient for the household use case.
- **Pure Sarvam:** Cheapest end-to-end, but Sarvam-1 LLM's function-calling track record is less battle-tested than GPT-4o-mini. Tool misfires would break the whole agent. Risk too high for MVP.
- **OpenAI primary with Sarvam fallback:** Runtime complexity (two providers to keep healthy), fallback logic is extra code, and most traffic still goes through the expensive primary. Premature optimization for a research project.

### Known trade-off

The 3-stage Sarvam-OpenAI-Sarvam pipeline feels **slightly more transactional** than OpenAI Realtime's native voice model. There's no audio-aware reasoning between turns, no prosody handling at the LLM layer, and interruption is framework-managed rather than model-native. Pipecat narrows this gap but doesn't eliminate it. If post-launch UX feels too robotic, the cheapest experiment is swapping just the LLM to OpenAI Realtime.

### Revisit when

- Sarvam STT accuracy on English-only sessions is poor enough to frustrate (consider per-language routing — detect first 2s of audio, route accordingly)
- Sarvam ships an LLM with battle-tested function calling (consider going Sarvam-only end-to-end)
- OpenAI prices drop to match Sarvam (consider going OpenAI Realtime end-to-end for the UX win)
- We add languages beyond Sarvam's coverage (consider per-language provider routing)

---

## ADR 004 — Feature catalog format: YAML

**Date:** 2026-05-21
**Status:** Accepted

### Context

The voice agent needs to answer questions about Kitchen Inventory features ("can I share my shopping list?", "how do I add an expiry date?"). The data behind these answers also drives:
1. The tool registry (function-calling definitions)
2. User-facing documentation
3. Onboarding tours
4. Potentially other AI agent surfaces (MCP server, Alexa skill)

We want a single source of truth so adding a feature means updating one file, not four.

### Decision

**YAML file** at `docs/feature-catalog.yaml`. Compiled to JSON at runtime for LLM injection into the voice agent's system prompt. Same source can be transformed to MD for user docs and to tool definitions for MCP/Pipecat.

### Rationale

- **Human-editable.** The user (you), not the LLM, will maintain this. YAML is the format least likely to be subtly corrupted by manual editing.
- **Comments allowed.** Important for annotations like `voice_can_do: false  # not yet implemented; planned Q3` that capture intent without affecting runtime behavior.
- **Multi-line strings.** Feature descriptions are paragraphs, not single lines.
- **Diffable + greppable** in git — important for tracking how the feature set evolves over time.
- Industry standard for config-as-data; lots of tooling support.

### Alternatives considered

- **JSON:** No comments support — would lose the intent annotations. More LLM-friendly natively but conversion to JSON for prompt injection is trivial.
- **Markdown:** Most human-friendly for documentation, but hard to parse structured fields reliably (need conventions, frontmatter, etc.). Better as a *generated output* from the YAML source.
- **TypeScript module with typed objects:** Best developer experience (type safety, autocomplete) but adds friction when non-developers want to suggest catalog entries. Also creates a build-step dependency for the LLM injection path.

### Revisit when

- The catalog grows beyond ~1000 feature entries (consider DB-backed catalog with versioning)
- We add internationalization — i18n keys would need a different shape
- Multiple authors are editing concurrently and merge conflicts become painful (DB-backed editing UI becomes attractive)

---

## ADR 005 — Feature catalog maintenance: discipline + tripwire, no automation

**Date:** 2026-05-21
**Status:** Accepted

### Context

`docs/feature-catalog.yaml` is the source of truth driving the voice agent's system prompt, future tool registry, and (eventually) generated user docs. The catalog must stay aligned with the actual app's behaviour or the voice agent confidently lies about features.

The single highest-risk drift mode is **removed features still in the catalog** — agent tells users about capabilities that no longer exist, eroding trust faster than any other failure mode. Less dangerous (but still real) is **tool-name mismatch** — catalog entries reference tools that don't exist in the runtime registry; calls fail.

Other drift modes (new feature not yet catalogued, stale sample utterances, status flags lagging reality) are low-severity — the agent under-promises rather than over-promises.

### Decision

Adopt a **deliberately minimal maintenance regime** for the first 2-3 months of voice-agent exploration:

1. **PR template checkbox** — `[ ] Updated docs/feature-catalog.yaml if user-visible behaviour changed`. Forces a moment of consideration during the change that produces drift.
2. **Quarterly catalog walk-through** — calendared 30-minute review where each entry is checked against the live app. Catches removed-feature drift, which is the dangerous one.
3. **No automation, no lint checks, no codegen** at this stage.

Revisit if quarterly review consistently finds >20% of entries needing changes.

### Rationale

- The catalog is small (~30 entries today) and dev velocity is low (one developer, side-project pace). Drift accumulates slowly enough that discipline plus a calendared review is sufficient.
- Automation (lint checks, codegen, catalog-derived tools) has real upfront cost. Many projects spend a month building catalog tooling and never ship the voice agent. For an exploration project, that's the worst failure mode.
- The catalog is a research artifact, not just operational documentation. Each quarterly walk-through is *also* a deliberate review of the app's feature set — has high value beyond drift mitigation.
- Cost estimate: ~10 min per shipped feature update + ~30 min per quarter = ~1-2 hours/month maintenance.

### Alternatives considered

- **Lint check that fails CI when catalog references a missing tool:** Half-day to write, eliminates the tool-name-drift category. Worth doing eventually but premature when there are no tools wired up yet. Add when ADR 007+ wires the tool registry.
- **Catalog-derived tool registry (Strategy C):** Tools auto-register from the catalog at Pipecat startup; impossible to have a catalog tool with no implementation. Highest discipline, lowest ongoing drift. ~1 week of investment. Deferred until there's evidence manual approach breaks.
- **Pure discipline without quarterly review:** Cheapest, but the "removed feature still in catalog" drift mode is precisely the one nobody notices without a deliberate review. Calendared ritual is the cheapest insurance.

### Revisit when

- Quarterly review consistently finds >20% drift → adopt the lint check (escalation 1)
- Lint check still leaves dangerous drift → adopt catalog-derived tool registration (escalation 2)
- Feature count crosses ~100 entries (manual walk-through becomes painful)
- Multiple developers ship to the catalog (single-author discipline doesn't scale to teams)

---

## ADR 006 — Voice agent tool access: hybrid (reads direct, writes via MCP)

**Date:** 2026-05-21
**Status:** Accepted

### Context

The voice agent runs on Modal (ADR 002) and needs to invoke Kitchen Inventory operations — list inventory, list shopping, add items, mark consumed, etc. The agent is *inside* a Python process; the operations live in TypeScript repos behind Supabase RLS, with additional safety logic (dry-run, ambiguity resolution, name normalization) wrapped around them in the MCP server. How should the Python voice agent reach those operations?

### Decision

**Hybrid routing by operation type:**

- **Read operations** (list, get, search) → Python in Modal calls Supabase directly using `supabase_as_user(user_id)` — same JWT-minting pattern as the Alexa skill (`lib/server/supabase-as-user.ts`).
- **Write operations** (add, update, delete, mark consumed) → Python in Modal calls the existing MCP server (`/api/mcp/mcp` on Vercel) over HTTP with a minted user JWT.

```
Reads:   Modal (Pipecat) ─── Supabase (RLS-scoped JWT)
Writes:  Modal (Pipecat) ─── Vercel (MCP server) ─── Supabase
```

### Rationale

- **Read latency matters; safety doesn't.** Reads are simple data fetches; no dry-run preview or ambiguity handling is needed. Direct Supabase is ~50ms; routing through MCP would add ~200ms for no behavioural benefit.
- **Write safety matters; latency is acceptable.** Write tools in the MCP server already implement dry-run-by-default, normalized-name matching, ambiguity detection with candidate lists, and `confirm: true` execution. Reimplementing these in Python would duplicate ~300 lines of subtle logic and create two places to keep in sync when they change.
- **Total implementation cost is low.** ~100 lines of Python: a Supabase client wrapper using HS256 JWTs minted from `SUPABASE_JWT_SECRET`, and an async HTTP client that POSTs JSON-RPC to the MCP server.
- **Voice agent UX wins through the dry-run pattern.** When the agent calls `mark_as_consumed` via MCP with `confirm: false`, it gets back a preview ("would archive 'Whole Milk' and add it back to your shopping list"). The agent narrates this to the user via TTS, gets verbal confirmation, then calls again with `confirm: true`. The same MCP safety the chat agents get applies to voice for free.

### Alternatives considered

- **Direct Supabase for everything (reads + writes):** Lower latency end-to-end. Forces us to reimplement dry-run, ambiguity, and normalization in Python. Logic duplicated across two languages and two services. Rejected: the duplication cost outweighs the latency win for writes.
- **MCP for everything (reads + writes):** One canonical path through the MCP server. Simplest mental model. Rejected: reads pay an extra ~200ms HTTP hop for no benefit — and that latency cost shows up as audible delay in voice conversations, which is where the user actually notices it.
- **Generate Python tool wrappers from the MCP server's JSON Schema:** Auto-derived clients. Cleanest in theory but premature; the MCP server has ~12 tools; manual wrappers are cheaper than codegen tooling at this scale.

### Revisit when

- Write tool surface grows past ~20 tools (codegen starts to earn its keep)
- The MCP HTTP hop becomes a bottleneck in actual voice latency measurements (currently theoretical; revisit only with real data)
- We add a third agent surface (e.g. a CLI agent) that needs the same tool access — at three consumers, a shared client SDK becomes worthwhile

---

## ADR 007 — Voice agent persona & system prompt construction

**Date:** 2026-06-01
**Status:** Accepted

### Context

Slice 1 replaces the loopback `EchoProcessor` with `OpenAILLMService` (GPT-4o-mini). For the agent to be useful (not just functional), we need explicit choices about identity, response style, language handling, and refusal behavior. These choices outlive Slice 1 — they govern every future agent surface and shape user expectations.

### Decision

**Identity**
- Name: **Kitchen Mate** (consistent with the Alexa skill's `pantry bro` precedent, but distinct — voice agent ≠ Alexa skill, so they can have different personalities).
- Role: a household kitchen inventory assistant. Scoped to Kitchen Inventory app features only.

**Response style**
- 1–2 sentences default. Never more than 4. Voice fatigue is real — terse beats thorough.
- Friendly, conversational, not corporate. Avoid "Certainly! I'd be delighted to..."
- When uncertain, say so explicitly ("I'm not sure" / "I can't tell from here") rather than hallucinate.

**Languages**
- Reply in whatever language the user spoke. Sarvam STT/TTS handle multilingual; GPT-4o-mini understands code-mixed Indian English / Hindi / Marathi.
- No explicit language detection — let the model handle it from transcript context.

**Scope refusal**
- Politely refuse off-topic requests ("I can only help with your kitchen inventory — try asking what's expiring or what's on your list").
- Don't speculate about features that aren't in the catalog. If a user asks about something unsupported, say so.

**System prompt construction**
- Full feature catalog YAML injected into system prompt verbatim. Prompt caching makes this cheap after turn 1 (~5KB → ~150 effective tokens).
- Catalog is the *source of truth* for what the agent knows about. If a feature isn't in `docs/feature-catalog.yaml`, the agent shouldn't claim it exists.
- Prefer tool calls over free-form answers when a tool can satisfy the request. "What's expiring?" → call `get_expiring_soon`, don't make up an answer.

**Greeting on session start**
- On client-ready, agent says: *"Hi, what can I help you with?"* (or equivalent in detected user-preference language)
- Removes the "is it listening?" ambiguity, the single highest-friction UX issue in early voice apps.

### Rationale

- Short responses = better voice UX. Long monologues kill engagement.
- Catalog-anchored knowledge keeps the agent from hallucinating features. Refusing gracefully when out of scope is more trustworthy than confidently wrong answers (see Slice 0 chat-agent transcript where ChatGPT auto-confirmed without asking — the lesson generalizes).
- Multilingual handling is already free from our stack choice (Sarvam + GPT). Forcing English-only would lose a real advantage for our household.
- Greeting is cheap. The UX win is disproportionate to the cost.

### Alternatives considered

- **No catalog in system prompt, full RAG instead.** Deferred — premature optimization at ~28 features. ADR 005 already addresses this.
- **Page-context-aware system prompt** (agent knows what page the user is on). Deferred to Slice 3 per the catalog's `where_am_i` entry — needs browser → Pipecat plumbing not built yet.
- **Pre-canned responses for common questions** (less LLM-dependent, faster, cheaper). Rejected — defeats the point of using GPT-4o-mini; we'd be reimplementing Alexa's intent matcher.

### Revisit when

- A real user (your wife) reports that responses are too short/long/curt/wordy → tune system prompt
- Cost of GPT-4o-mini per session starts mattering (~₹100+/day) → consider Sarvam-1 LLM or system-prompt trimming
- Page context becomes obviously missing in conversations → ship Slice 3 sooner

---

## ADR 008 — Voice session logging: transcripts only, no audio (initially)

**Date:** 2026-06-01
**Status:** Accepted

### Context

Slice 1 needs some form of session observability — to debug when the agent misbehaves, build intuition for what users actually say, and eventually inform fine-tuning. Three logging tiers were considered earlier in design (ADR-008-precursor discussion):

- A: no logging
- B: transcripts + tool calls + timings (text only)
- C: audio + transcripts + tool calls + timings

### Decision

**Ship B for Slice 1.** Defer audio capture (C) to a later slice with deliberate consent + retention design.

Concretely:
- New table `public.voice_session_logs` storing one row per turn (user transcript, agent response, tool call, or system message) with timestamps, latency, and model used.
- Gate logging behind a new column on `public.feature_grants`: `voice_logs_enabled boolean default false`. Same admin-controlled pattern as `voice_agent_enabled` — user can read their own logs but only service-role can flip the toggle.
- RLS: users can SELECT their own logs (so we can later build a "voice history" UI if useful), but only Modal's service-role inserts.
- No audio storage at any stage of Slice 1.

### Rationale

- **Transcripts cover ~95% of debugging value.** Most "did the agent misbehave?" investigations need to read what was said, not hear it.
- **Audio is meaningfully more sensitive than transcripts.** Voice biometrics, emotional state, identification — all derivable from raw audio. Storing transcripts only is one risk category lower.
- **Storage cost scales.** Audio at 16kHz Opus ≈ 3–5 MB / 10 min. Across a household, ~30 GB/year. Supabase Storage free tier is 1 GB; beyond is paid. Transcripts are bytes per turn, effectively free.
- **Reversibility is asymmetric.** Adding audio capture later is cheap (new migration + flag + recording code). Removing audio after you've collected it requires actual data purges, backup handling, etc. Always easier to under-collect than over-collect.
- **Slice 1 doesn't need audio for any current goal** (Q&A + 2 read tools).

### Alternatives considered

- **A — no logging.** Cleaner privacy posture but blind debugging. Rejected for the first voice slice where bugs are guaranteed.
- **C — log audio too.** Right answer eventually if we need to investigate "did Sarvam hear it correctly?" mysteries. Premature now.
- **Log to disk/Modal local storage instead of Supabase.** Avoids RLS work but logs vanish on container recycle. Wrong tradeoff.

### Revisit (add audio capture) when

- First debugging session where the transcript is clearly wrong and you need to verify what was actually said
- Voice training data becomes a planned product (fine-tuning Sarvam STT to better recognize household-specific vocabulary like "atta", "mishri", etc.)
- We invite users outside the household — at that point, redesign consent copy + retention policy first

When audio capture is added, requirements include:
1. Explicit user-facing consent copy ("we record voice audio for X duration to debug Y")
2. Retention policy (90 days default, deletable on request)
3. Encrypted at rest (Supabase Storage handles)
4. Separate toggle from transcript logging — opt-in to each independently

---

## How to add a new decision

1. Increment the ADR number (next one is ADR 009).
2. Use the template above: Date, Status, Context, Decision, Rationale, Alternatives, Revisit triggers.
3. Don't edit historical entries to "fix" the rationale in hindsight. Add a new ADR that supersedes the old one — keeps the reasoning history honest.
4. Update the entry's Status if it's later superseded: `Status: Superseded by ADR 0XX`.
