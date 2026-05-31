# Kitchen Inventory — voice agent

Pipecat-based voice agent for Kitchen Inventory. Runs on Modal. Talks to the
main Next.js app via direct Supabase reads + the MCP server for writes.
See [../docs/decisions.md](../docs/decisions.md) ADRs 001–006 for full rationale.

This is **Slice 0** — Sarvam STT → echo → Sarvam TTS. No LLM, no tools, no
auth gate, no browser widget yet. The goal of this stage is to confirm the
audio pipeline round-trips end-to-end before anything else.

## Verified working (as of 2026-06-01)

The deployment foundation and pipeline assembly are confirmed:

- ✅ Modal image builds, container deploys, secrets attach correctly
- ✅ Pipecat 1.3.0 loads
- ✅ `pipecat.transports.websocket.fastapi.FastAPIWebsocketTransport` imports (was `pipecat.transports.network.fastapi_websocket` in pre-1.3 — see in-code comment)
- ✅ `SarvamSTTService` instantiates with `model="saarika:v2.5"`, `language="en-IN"`
- ✅ `SarvamTTSService` instantiates with `model="bulbul:v2"`, `voice_id="anushka"`
- ✅ Full pipeline assembles without error
- ✅ `/health` returns 200 with all three secrets present
- ✅ `/ws` accepts WebSocket upgrade, stays open waiting for audio
- ✅ Sarvam STT + TTS connect from inside Modal to Sarvam's APIs at session start
- ⏳ **Audio doesn't flow end-to-end yet.** The browser test client connects
  cleanly, mic captures, but no audio frames reach Sarvam STT inside the
  pipeline. Root cause: protocol mismatch.

## Known limitation: client/server protocol mismatch

`@pipecat-ai/websocket-transport` (the JS client SDK we use in
`test_client.html`) speaks the **RTVI protocol** — handshake, structured
client/server messages, etc.

`pipecat.transports.websocket.fastapi.FastAPIWebsocketTransport` (our
server transport) speaks **raw Pipecat frames** without the RTVI envelope.

At the WebSocket level they connect fine. At the application layer they
talk different languages — RTVI-formatted frames from the browser are
silently dropped server-side because they're not the protobuf-encoded raw
frames the transport expects. Modal logs confirm this: pipeline starts,
Sarvam STT/TTS connect to their APIs, then nothing for the session
duration until disconnect.

**Fix (next session):** wrap the server pipeline with an RTVI-compatible
session manager. Pipecat exposes `RTVIObserver` / `RTVIProcessor` / an
RTVI session helper. Server-side change, no client changes needed.
~1 hour of focused work in a fresh context.

Alternative (more JS code): write a raw browser client that encodes
audio as protobuf frames matching the server's expected format. ~150
lines, but bypasses the SDK. Use this only if RTVI on the server proves
infeasible.

## Prerequisites

- Python 3.11+ locally (Modal handles the container side — your local
  Python is only for the `modal` CLI)
- `modal` CLI installed and authenticated: `pip install --upgrade modal && modal setup`
- API keys: Sarvam, OpenAI, Supabase URL + anon key + JWT secret
- Your Supabase user UUID (the household user the agent acts as)

## First-time setup

### 1. Configure Modal Secrets

These are read by the deployed function — do this once per environment:

```bash
modal secret create sarvam-api-key SARVAM_API_KEY=<your-sarvam-key>
modal secret create openai-api-key OPENAI_API_KEY=<your-openai-key>
modal secret create supabase-config \
    NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key> \
    SUPABASE_JWT_SECRET=<your-jwt-secret>
```

Verify with `modal secret list`.

### 2. Local `.env` (for `modal serve` hot-reload dev)

```bash
cp .env.example .env
# Edit .env with the same values as Modal Secrets above, plus VOICE_AGENT_DEV_USER_ID
```

`.env` is gitignored. Modal Production does NOT read this file — it uses
Modal Secrets. They serve two different environments.

## Deploy

```bash
modal deploy modal_app.py
```

Modal prints the public URL (something like
`https://your-org--kitchen-inventory-voice-fastapi-app.modal.run`). Save it —
you'll point the browser widget at this URL in a future session.

## Verify the deployment

The fastest sanity check — no audio plumbing needed:

```bash
curl https://<your-modal-url>/health
```

Expected:

```json
{
  "ok": true,
  "service": "kitchen-inventory-voice",
  "stage": "session 1 — loopback echo",
  "sarvam_key_present": true,
  "openai_key_present": true,
  "supabase_jwt_present": true
}
```

If any of those `*_present` flags is `false`, the corresponding Modal Secret
isn't set or isn't attached. Re-check step 1.

## Local development

For hot-reload during development (instead of full deploy each time):

```bash
modal serve modal_app.py
```

Modal gives you a temporary URL that updates on every file save. Useful
when iterating on `pipeline.py`.

## Testing the audio pipeline end-to-end

`test_client.html` is a minimal browser client for verifying the full
STT → echo → TTS round-trip with a real microphone.

**Why a local HTTP server instead of `file://`:** browsers gate microphone
access on a "secure context." HTTPS, localhost, and (sometimes) file:// all
qualify, but localhost is the most reliable across browsers.

```bash
cd voice-agent
python3 -m http.server 8000
```

Then open http://localhost:8000/test_client.html in Chrome (Safari may need
extra mic permissions in System Settings). Click **Connect**, allow the mic
prompt, and speak. Expected behaviour:

1. Status flips to "Connected — speak now"
2. As you speak, the agent's Sarvam STT transcribes — your words appear in
   blue in the log
3. The agent (loopback) emits "You said: &lt;your text&gt;" — appears in
   the log in brown
4. Sarvam TTS speaks the echo through your speakers
5. The "Agent speaking…" → "Agent finished" lifecycle logs

If the connection drops or you see errors, the log entries (and browser
console — Cmd+Opt+J in Chrome) have the diagnostic information.

### Known risks in the test client

- **Pipecat JS client package paths may have drifted.** Same risk as the
  Python side did. If you see "Cannot find module @pipecat-ai/..." or
  "ProtobufFrameSerializer is not a constructor", check the current
  package layout at https://github.com/pipecat-ai/pipecat-client-web and
  update the import lines.
- **Sarvam audio sample rate.** The test client sends 16kHz mono. If Sarvam
  STT rejects frames with a sample-rate error, adjust the `sampleRate` in
  the `WebSocketTransport` config.
- **Browser mic permission UI.** Chrome remembers permission per-origin.
  If you previously denied mic on localhost:8000, reset it via the lock
  icon in the address bar → Site settings → Microphone → Allow.

## Project structure

```
voice-agent/
├── pyproject.toml      # Python dependencies
├── modal_app.py        # Modal entrypoint (image, secrets, ASGI surface)
├── pipeline.py         # Pipecat pipeline + FastAPI routes
├── .env.example        # Local env template
├── .gitignore
└── README.md           # this file
```

## Architecture context

- **Where it runs:** Modal (ADR 002)
- **Why Pipecat:** STT/LLM/TTS pipeline framework with first-class Sarvam plugins (ADR 001)
- **Pipeline shape:** Sarvam Saarika (STT) → OpenAI GPT-4o-mini (LLM, session 2+) → Sarvam Bulbul (TTS) (ADR 003)
- **Tool access:** Reads call Supabase directly; writes call the Next.js MCP server (ADR 006)
- **Cost ceiling:** 10 min hard cap per session via Modal timeout; per-user daily cap is on the backlog

## Known limitations (Slice 0)

- No LLM yet — the loopback processor just echoes the transcript
- No auth gate — anyone with the WebSocket URL can connect (added in session 2)
- No browser widget — test by writing a Pipecat client or wait for the Next.js
  voice widget in session 4
- Sarvam class names + model identifiers in `pipeline.py` may need adjustment
  against current Pipecat docs — see comments in the file

## Pipecat API version drift

If imports break at deploy time:

```bash
pip show pipecat-ai          # check installed version
```

Then verify import paths against the version's docs. Pipecat's package
structure has evolved; the imports in `pipeline.py` reflect a recent
(~2026-05) layout. Update if needed — the pipeline *shape* (Pipeline of
processors, PipelineTask, PipelineRunner) is stable across versions.
