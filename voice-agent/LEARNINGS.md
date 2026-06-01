# Voice agent — implementation learnings

Captured 2026-06-01 after Slices 0 & 1 shipped end-to-end. The
README.md covers the *what* (current setup, known import paths, model
identifiers). This document captures the *what would have made us
faster* — the iteration patterns and discovery sequences that ate
time, so the next slice doesn't repeat them.

Read this before starting a new voice-agent slice. Read the README
when you're already in the code.

---

## The meta-lesson: voice has three independent API drift surfaces

Slices 0–1 burned roughly 8–10 deploy cycles on API drift. The drift came from three independent surfaces, and the pattern of "deploy → see error → patch import → redeploy" is the dominant cost.

The three surfaces that drift:

1. **Pipecat Python server-side** — package layout, class names, removed/renamed types
2. **Pipecat JS client-side** — package names on npm, exports, CDN transpilation
3. **Provider APIs** — Sarvam model identifiers, OpenAI realtime vs chat completions

**Predictive rule:** before writing the first import, allocate ~30 min for `/diagnostics`-style introspection. It's cheaper to learn what's there than to guess and redeploy.

---

## Faster-start playbook for the next slice

Apply these *before* writing new pipeline code:

### 1. Re-run `/diagnostics` immediately after Pipecat version bumps

The endpoint at [pipeline.py — diagnostics](pipeline.py) probes import paths and lists module exports for the Pipecat version currently deployed. **Hit it once at the start of any session that touches Pipecat code.** Saves at least one deploy cycle of "I guessed; deploy errored on import; patch import path; redeploy."

When extending to new Pipecat surfaces (function calling, audio mixers, observers, etc.), add probe targets to the `/diagnostics` candidates list *before* writing the pipeline code that uses them.

### 2. Check Pipecat's CHANGELOG before each new feature

[github.com/pipecat-ai/pipecat/blob/main/CHANGELOG.md](https://github.com/pipecat-ai/pipecat/blob/main/CHANGELOG.md)

Pipecat is moving fast. In one quarter we hit three removed/renamed APIs:
- `pipecat.transports.network.fastapi_websocket` → `pipecat.transports.websocket.fastapi`
- `OpenAILLMContext` (removed) → universal `LLMContext`
- `RTVIConfig` (removed) → `RTVIProcessor()` takes no config

WebSearch / WebFetch on `docs.pipecat.ai` for the specific class is faster than guessing and waiting for Modal logs.

### 3. Don't trust the doc examples blindly

Pipecat's official docs lag the codebase. We hit this with `OpenAILLMContext` — current docs still reference it; GitHub examples use `LLMContext`. **When docs and CHANGELOG disagree, trust the CHANGELOG / examples.**

### 4. JS client SDKs are renamed more often than Python ones

`@pipecat-ai/client-web` → `@pipecat-ai/client-js`. Before importing, hit `https://www.npmjs.com/~pipecat-ai` and confirm package names exist *now*.

### 5. Use jsdelivr's `+esm`, not esm.sh, for Pipecat JS

esm.sh mistranspiles Pipecat's class inheritance — gives
`Class constructor E cannot be invoked without 'new'` deep inside transport code. jsdelivr's `+esm` bundler handles it.

```html
<!-- BAD: https://esm.sh/@pipecat-ai/websocket-transport -->
<!-- GOOD: -->
<script type="module">
  import * as PipecatWS from "https://cdn.jsdelivr.net/npm/@pipecat-ai/websocket-transport@1.6.5/+esm";
</script>
```

---

## Specific iteration sequences that cost us deploys

Numbered roughly by impact. For each, the root cause is captured plus
the diagnostic that would have surfaced it in one shot.

### Pipecat 1.3.0 transport reorg (Slice 0)

**Symptom:** `ModuleNotFoundError: No module named 'pipecat.transports.network'`
**Root cause:** transports moved to `pipecat.transports.websocket.fastapi` in 1.3.x
**Fast diagnostic:** `/diagnostics` import_probes section already lists current locations.
**Apply this lesson by:** treating *every* `pipecat.*` import as drift-prone on a new install. Run `/diagnostics` before deploying real pipeline code.

### Sarvam model name drift (Slice 0)

**Symptom:** Sarvam returns `Unsupported model 'saarika:v2'. Allowed values: saaras:v2.5, saaras:v3, saarika:v2.5.`
**Root cause:** Sarvam deprecated `saarika:v2`; we caught that. Then Slice 1 we missed that `saarika:v2.5` is itself now legacy — the current SOTA is `saaras:v3` with `mode="transcribe"`.
**Fast diagnostic:** check [docs.sarvam.ai](https://docs.sarvam.ai/api-reference-docs/models/saarika) or [Saaras V3 announcement](https://www.sarvam.ai/blogs/asr) *before* picking a model. Sarvam's error messages are excellent — they tell you the allowed list — but only after a failed deploy.
**Apply this lesson by:** treating Sarvam model identifiers as *checked-against-docs each time you bump or start a new project*. Don't assume yesterday's working identifier is today's recommended.

### RTVI protocol mismatch (Slice 0)

**Symptom:** WebSocket connects, mic captures, audio flows server-side, but Sarvam STT never emits a transcription. Modal logs show pipeline started, Sarvam connected, then nothing.
**Root cause:** `@pipecat-ai/websocket-transport` (the JS client SDK we use) speaks the **RTVI protocol**. `pipecat.transports.websocket.fastapi.FastAPIWebsocketTransport` (server) speaks **raw Pipecat frames**. They handshake fine over WebSocket but talk different application-layer protocols — frames are silently dropped.
**Fix:** wrap the server pipeline with `RTVIProcessor` (in the pipeline) + `RTVIObserver` (on the `PipelineTask`).
**Apply this lesson by:** whenever pairing a Pipecat JS client SDK with a server transport, **assume RTVI on the client and confirm RTVI on the server.** If using FastAPIWebsocketTransport, you must add the RTVI bridge.

### Echo emitting `TextFrame` instead of `TTSSpeakFrame` (Slice 0)

**Symptom:** STT transcribes, but TTS doesn't speak the echo back.
**Root cause:** Pipecat TTS services don't synthesize raw `TextFrame`; they expect `TTSSpeakFrame` (direct command) or text wrapped in LLM aggregation markers (`LLMResponseStartFrame` → `LLMTextFrame` → `LLMResponseEndFrame`).
**Apply this lesson by:** when emitting text *outside* an LLM service (e.g. from a passthrough processor or a programmatic greeting), wrap in `TTSSpeakFrame`. When emitting *from* an LLM service, the aggregation markers are added automatically by `OpenAILLMService`.

### OpenAILLMContext removed (Slice 1 Stage 1)

**Symptom:** `ModuleNotFoundError: pipecat.processors.aggregators.openai_llm_context`
**Root cause:** Removed in favor of provider-agnostic `LLMContext` + `LLMContextAggregatorPair`.
**Fast diagnostic:** [Pipecat CHANGELOG](https://github.com/pipecat-ai/pipecat/blob/main/CHANGELOG.md) — this was a documented migration.
**Apply this lesson by:** when wiring an LLM service, use `LLMContext(messages, tools=...)` and `LLMContextAggregatorPair(context)`. Forget about `OpenAILLMContext`.

### Supabase auth-cookie location surprises (Slice 1 Stage 2)

**Symptom:** Spent ~30 min trying to find the user's Supabase access_token in browser storage. Looked in localStorage on wrong origin (`vercel.live` instead of the app), found custom-named keys, discovered Supabase splits the session across multiple cookies with `@supabase/ssr`.
**Root cause:** Multiple plausible storage locations:
- localStorage on the app's origin (if not using `@supabase/ssr`)
- A cookie like `sb-<ref>-auth-token` — but split across `.0`, `.1` shards
- Sometimes also in sessionStorage
- Vercel preview deployments add a separate `vercel.live` iframe with its own storage that's *not* relevant
**Fix:** added a `/api/dev/voice-token` server route that calls `supabase.auth.getSession()` and returns the access_token cleanly. **Should have been the first thing built when we decided on JWT-based auth.**
**Apply this lesson by:** whenever a flow needs a user JWT for testing, build the server endpoint that returns it *before* you start the testing loop. Five minutes upfront saves multiple debugging sessions.

### Supabase moved to asymmetric JWT signing (Slice 1 Stage 2)

**Symptom:** `Token failed verification: The specified alg value is not allowed`
**Root cause:** Supabase migrated newer projects from HS256 (shared `SUPABASE_JWT_SECRET`) to RS256/ES256 (per-project key pair, verified via JWKS endpoint). Our code only allowed HS256.
**Fix:** detect `alg` from JWT header, route to:
- HS256 → verify with `SUPABASE_JWT_SECRET`
- RS256/ES256 → fetch JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, verify with public key
- Add `PyJWT[crypto]` extra for cryptography support
**Apply this lesson by:** never assume Supabase auth is HS256. Always inspect the header and route accordingly. Use `pyjwt.get_unverified_header(token)["alg"]` and branch.

### WebSocket close-before-accept produces generic 1006 (Slice 1 Stage 2)

**Symptom:** Browser sees `1006 abnormal closure` no matter what server-side code says.
**Root cause:** Calling `websocket.close(code=4001)` before `websocket.accept()` doesn't send the close code to the browser — the browser just sees a generic disconnect.
**Fix:** always `accept()` first, then `send_json({error: ...})` for diagnostics, then `close(code=4001, reason=...)`. Browser receives both the error JSON and the proper close code.
**Apply this lesson by:** any WebSocket auth gate that wants its close codes visible should accept first, validate second.

---

## Workflow patterns that worked

These are the things that *did* save time. Reapply them.

### Diagnostic endpoints on the deployed service

`/health` (sanity check) and `/diagnostics` (introspect Pipecat module layout) were disproportionately valuable. **Build these in the first 30 minutes of any new Pipecat service.** They turn deploy-and-pray into deploy-and-inspect.

### Catalog-first development

Already documented in [decisions.md ADR 005 postscript](../docs/decisions.md) — writing the feature catalog YAML *before* the consuming code surfaced naming and scope decisions upfront. Zero rework when Stage 2 wired tools — catalog already specified them correctly.

### One-deploy-per-decision iteration

Each deploy cycle answers one specific question. Don't bundle changes — if you change four things and a deploy fails, you can't isolate. The pace felt slow but the alternative (compound changes + bisecting failures) was slower.

### Modal logs in a second terminal

`modal app logs <app-name>` running in a separate terminal during browser testing surfaces server-side errors in real time. Without this, you'd have to disconnect, query, reconnect, repeat. Always run it.

### Commit at every working milestone

We have separate commits for Slice 0 scaffold, Slice 0 WIP, Slice 0 working, Slice 1 Stage 1, etc. When something breaks unexpectedly, `git diff` against the last working commit narrows the search space dramatically.

---

## Open questions / things to investigate when next picking this up

- **Does Pipecat 1.3.0+ support `PyJWKClient` caching the way I assumed?** Each WebSocket connect currently fetches JWKS unless PyJWKClient's default cache kicks in. Worth a smoke test on cold-start latency.
- **Sarvam Saaras v3 mode="transcribe" vs default behavior** — we set mode explicitly, but if default is also transcribe for saaras:v3 we could simplify. Verify against current Sarvam docs.
- **Pipecat function-calling API stability** — we verified `register_function()` + `FunctionSchema` + `ToolsSchema` work in 1.3.0. These are highly likely to drift; pin or re-verify on each Pipecat bump.

---

## Quick-reference: who-renamed-what cheat sheet

If something stops working after a Pipecat / Pipecat-client / Sarvam version bump, check these first:

| Component | Old name (deprecated) | Current name (2026-06) |
|---|---|---|
| Pipecat FastAPI transport | `pipecat.transports.network.fastapi_websocket` | `pipecat.transports.websocket.fastapi` |
| Pipecat OpenAI context | `OpenAILLMContext` from `…openai_llm_context` | `LLMContext` from `…llm_context` |
| Pipecat OpenAI context aggregator | `llm.create_context_aggregator(ctx)` | `LLMContextAggregatorPair(ctx)` |
| Pipecat RTVI config | `RTVIConfig` (removed) | `RTVIProcessor()` no-arg |
| Pipecat JS client npm package | `@pipecat-ai/client-web` | `@pipecat-ai/client-js` |
| Sarvam STT model | `saarika:v2`, `saarika:v2.5` (legacy) | `saaras:v3` + `mode="transcribe"` |
| Sarvam TTS model | `bulbul:v2` (deprecated but still works) | `bulbul:v3` voice `"shubh"` |
| Supabase JWT algorithm | HS256 with `SUPABASE_JWT_SECRET` | Mixed — RS256/ES256 via JWKS on newer projects |

Update this table whenever a future Pipecat/Sarvam version bump renames something.
