# OpenRouter integration — cross-project playbook

Distilled from migrating Kitchen Inventory's AI features off a direct OpenAI
integration onto OpenRouter (see [ADR 011](decisions.md) for the *why*). Every
item below is something we actually hit in production; the goal is that the next
project skips the same debugging loop.

OpenRouter is an OpenAI-wire-compatible gateway: one key, many providers
(OpenAI, Google, Anthropic, DeepSeek, …), per-key spend caps, model fallback,
and **BYOK** (route requests to *your own* provider key). The failure modes below
are mostly about the seams between providers, not OpenRouter itself.

---

## TL;DR checklist for a new integration

- [ ] Talk to it through the **official `openai` SDK** — just set `baseURL` + key. No rewrite.
- [ ] Keep **one provider-agnostic client factory** as the single swap point. Don't `new OpenAI()` inline in each route.
- [ ] **Env-drive model IDs**, never hardcode them. Log the *resolved* model for provenance.
- [ ] Namespace model IDs (`openai/…`, `google/…`). Know what `:free`, `:batch`, and `-image` variants mean.
- [ ] **Always set `max_tokens`** on every call — or eat a 402 pre-flight cost error.
- [ ] **Never `JSON.parse()` raw model output.** Strip code fences / extract the JSON body first.
- [ ] For **BYOK**: turn on "Always use for this provider," and keep a small credit balance for headroom.
- [ ] **Smoke-test every route live.** `tsc`/build won't catch any of the runtime seams below.

---

## 1. It's a drop-in — `baseURL` + key, not an SDK rewrite

Both OpenRouter and OpenAI speak the same Chat Completions API. Migration is a
config swap, not a code rewrite. Keep the existing `openai` npm client, message
shapes, vision blocks, and `response_format`.

```ts
new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": siteUrl, "X-Title": appName }, // optional attribution
})
```

Put this behind **one factory** (`getLLM()` in this repo →
[`lib/server/llm.ts`](../lib/server/llm.ts)) so provider/model selection lives in
exactly one place. Every route calls the factory; no route constructs a client.

## 2. Model IDs: namespacing and the variant traps

- Model IDs are **namespaced**: `openai/gpt-4o-mini`, `google/gemini-3.5-flash`.
  On a direct-OpenAI fallback path, strip the `openai/` prefix (OpenAI rejects
  namespaced IDs).
- **`:free`** (e.g. `google/gemini-2.0-flash-exp:free`) = OpenRouter's *own*
  shared free pool. It is **not** your BYOK key — using a `:free` ID bypasses
  BYOK entirely and is subject to the free-tier daily cap.
- **`:batch`** = the async batch API, not real-time. Don't use it for request/response.
- **`-image`** variants (e.g. `gemini-*-flash-image`) are image *generation*
  models, **not** vision input. For "read this photo," use the plain Flash model,
  which accepts image input.
- **Confirm the model exists under the key that will serve it.** With BYOK, the
  available model set is whatever *your* provider account exposes, which may be a
  subset of what OpenRouter lists. A wrong/unavailable slug 404s.

## 3. BYOK gotchas

BYOK routes inference to your own provider key (e.g. Google AI Studio), so you
use *your* provider quota instead of OpenRouter credits. Two things bit us:

- **"Always use for this provider" must be ON.** If it's off, OpenRouter silently
  falls back to its own **paid pool** and charges *your OpenRouter credits* — you
  think you're on your free Google quota but you're not. The tell: cost/credit
  errors firing even though BYOK is "configured."
- **BYOK still needs a little credit headroom** for the platform fee and the
  pre-flight check (below). A pure $0 balance can still get gated.

Free-tier limits worth knowing: **50 requests/day** on a $0 account, rising to
**1,000/day** permanently after a one-time **$10** credit purchase (the unlock
never expires; credits themselves don't expire while the account stays active).

## 4. The 402 pre-flight cost trap → always set `max_tokens`

**Error we hit:**

> `402 This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 4444.`

OpenRouter estimates the **worst-case** cost *before* running:
`(input tokens + max_output_tokens) × price`, and refuses if the balance can't
cover it — even though the actual completion is tiny.

The trap: **if you omit `max_tokens`, OpenRouter assumes the model's full max
output.** For Gemini Flash that's **65,536 tokens** — a 16–32× overestimate that
402s on any modest balance. (The number in the error also fingerprints the model:
65,536 = Gemini Flash, 16,384 = GPT-4o-mini.)

**Fix: set a sane `max_tokens` on every call.** In this repo one route had
omitted it and was the only one that failed — the others (768 / 2048 / 4096) were
fine. See the recipe route fix in
[`app/api/recipes/parse-text/route.ts`](../app/api/recipes/parse-text/route.ts).

## 5. JSON output isn't uniform across providers → never `JSON.parse()` raw

**Error we hit:** after switching a route to Gemini, `500 — "AI returned invalid JSON."`

OpenAI's `json_object` mode returns **bare** JSON. **Gemini (via OpenRouter)
routinely wraps it** in a ` ```json … ``` ` markdown fence or prefixes a line of
prose. A naive `JSON.parse()` throws on that — the model answered correctly, we
just couldn't parse it.

**Fix: a tolerant extractor** that tries, in order: the raw string → the contents
of a fenced code block → the substring from the first `{`/`[` to the last
`}`/`]`. This repo's `parseModelJson()` lives in
[`lib/server/llm.ts`](../lib/server/llm.ts); wire it into every route that
expects JSON. Keep logging the **literal** raw text for provenance/debugging —
extract only for parsing.

> Rule of thumb: treat `response_format: json_object` as a *hint*, not a
> guarantee, on any non-OpenAI model. Always parse defensively.

## 6. Don't hardcode model IDs — they drift fast

Model names move quickly. Over a few months Gemini went `2.0-flash` →
`2.5-flash` → `3.5-flash` → `3.6-flash`; a slug that was current at write-time is
stale by the next quarter. Consequences:

- **Env-drive every model ID** so switching (or fixing a retired slug) is a
  dashboard change, not a deploy.
- **Log the resolved model** with each interaction (we log it as the provenance
  `modelVersion`), so training data / debugging reflects what actually ran.
- When recommending a slug, **copy the exact string from the provider's live
  model page** — don't trust a model name from memory or an LLM (ours was stale).

## 7. What CI won't catch — smoke-test per route

Every failure above (`402`, invalid JSON, wrong slug, BYOK-not-applied) is a
**runtime** seam. `tsc --noEmit`, lint, and `next build` pass clean through all
of them. After any provider/model change, do a live smoke test of **each** route
that calls the model — especially the ones that send images or expect structured
JSON, since those exercise the most provider-specific behavior.

---

## Reusable snippets

The two pieces worth copying verbatim into the next project:

- **`getLLM(modelEnv, default)`** — provider selection by key precedence,
  `baseURL` wiring, namespaced-ID handling, and a comma-separated
  primary + fallback `models` chain. → [`lib/server/llm.ts`](../lib/server/llm.ts)
- **`parseModelJson(raw)`** — the fence/prose-tolerant JSON extractor from §5.
  → same file.

Both are provider-neutral: pointing `LLM_BASE_URL` at a different gateway (e.g.
Vercel AI Gateway) is a config change, not a code change.
