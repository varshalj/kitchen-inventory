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

## How to add a new decision

1. Increment the ADR number (next one is ADR 007).
2. Use the template above: Date, Status, Context, Decision, Rationale, Alternatives, Revisit triggers.
3. Don't edit historical entries to "fix" the rationale in hindsight. Add a new ADR that supersedes the old one — keeps the reasoning history honest.
4. Update the entry's Status if it's later superseded: `Status: Superseded by ADR 0XX`.
