"""
Pipecat pipeline definition for the Kitchen Inventory voice agent.

Session 1 (this file): Sarvam STT → loopback echo → Sarvam TTS.
The "LLM" stage is a no-op processor that just emits "You said: <transcript>".
This proves the audio pipeline + Sarvam plugins work before adding GPT-4o-mini.

Session 2 will swap the loopback for an actual `OpenAILLMService` with the
feature catalog injected into the system prompt.

The exact Pipecat import paths below reflect my best understanding as of
2026-05; Pipecat's API has been evolving. If imports fail at deploy time,
check the current Pipecat docs (https://docs.pipecat.ai) or
`pip show pipecat-ai` to find the right symbol locations.
"""

from __future__ import annotations

import os
from fastapi import FastAPI, WebSocket


# ─── Feature catalog → system prompt ──────────────────────────────────────────

# Catalog path inside the Modal container. modal_app.py mounts the YAML
# from ../docs/feature-catalog.yaml at this path via add_local_file.
_CATALOG_PATH = "/root/feature-catalog.yaml"

_SYSTEM_PROMPT_TEMPLATE = """\
You are Kitchen Mate, a friendly voice assistant for Kitchen Inventory — \
a household pantry and shopping management app.

# Your role
You help users manage their kitchen: track what they have, what's expiring, \
what they need to buy, what they can cook. You are scoped to this app's \
features only.

# Response style
- Keep responses to 1–2 sentences. Never more than 4. This is voice — terse \
beats thorough.
- Be friendly and conversational, not corporate or stiff.
- When uncertain, say "I'm not sure" or "I can't tell from here". Don't make \
things up.
- Reply in whatever language the user spoke — English, Hindi, Marathi, or \
code-mixed all work.

# Current capabilities (Slice 1)
You are in early development. Right now you can:
- Describe what Kitchen Inventory does
- Explain how to use any feature (the catalog below has UI paths and \
descriptions)
- Answer questions about features in the catalog

You CANNOT yet:
- Read the user's actual inventory or shopping list data
- Add, modify, or delete items
- Look up specific recipes

For data requests ("what's in my fridge", "what's on my shopping list"), say: \
"I can't read your inventory yet, but you can see it in the app." Don't \
pretend to know.

# Scope refusal
If asked about anything outside this app's scope (general questions, news, \
other apps), say: "I can only help with your Kitchen Inventory — try asking \
what features I support or how to do something in the app."

# Feature catalog (single source of truth)
Below is the complete list of features. Use this to answer questions about \
what the app does and how to use it. If a feature is not here, do not claim \
it exists.

```yaml
{catalog}
```
"""


def _build_system_prompt() -> str:
    """Read the feature catalog from disk and format it into the system prompt."""
    try:
        with open(_CATALOG_PATH, "r") as f:
            catalog = f.read()
    except FileNotFoundError:
        catalog = (
            "(feature catalog not loaded — /root/feature-catalog.yaml not "
            "found in container. Check modal_app.py add_local_file path.)"
        )
    return _SYSTEM_PROMPT_TEMPLATE.format(catalog=catalog)


# ─── Public entrypoint ────────────────────────────────────────────────────────


def build_app() -> FastAPI:
    """
    Construct the FastAPI app Modal exposes. Endpoints:

      GET  /health   — liveness probe, no auth, no Pipecat dependency.
                       Hit this first to verify Modal deployment works.
      WS   /ws       — Pipecat voice session. Expects raw audio frames in,
                       returns synthesized audio frames out.
    """
    app = FastAPI(title="Kitchen Inventory voice agent")

    @app.get("/health")
    async def health():
        """Cheap, no-Pipecat-dependency endpoint to verify deployment."""
        return {
            "ok": True,
            "service": "kitchen-inventory-voice",
            "stage": "session 1 — loopback echo",
            "sarvam_key_present": bool(os.environ.get("SARVAM_API_KEY")),
            "openai_key_present": bool(os.environ.get("OPENAI_API_KEY")),
            "supabase_jwt_present": bool(os.environ.get("SUPABASE_JWT_SECRET")),
        }

    @app.get("/diagnostics")
    async def diagnostics():
        """
        Introspect Pipecat to discover the right import paths for the
        installed version. Used to patch pipeline imports without guessing.
        Safe to leave in long-term — read-only, no secrets exposed.
        """
        import pipecat
        import pkgutil

        # Walk every module under the pipecat package and list it.
        all_modules = []
        try:
            for finder, name, ispkg in pkgutil.walk_packages(
                pipecat.__path__, prefix="pipecat."
            ):
                all_modules.append(name)
        except Exception as e:
            all_modules = [f"<walk_packages failed: {e}>"]

        # Filter to the modules we care about for the loopback pipeline.
        keywords = ("transport", "websocket", "fastapi", "sarvam", "openai")
        relevant = [m for m in all_modules if any(k in m.lower() for k in keywords)]

        # Probe candidate import paths so we can see which actually resolve.
        candidates = [
            # FastAPI-WebSocket transport — known location in <1.3 was
            # pipecat.transports.network.fastapi_websocket; need to find the
            # 1.3.0 equivalent.
            "pipecat.transports.network.fastapi_websocket",
            "pipecat.transports.websocket.fastapi",
            "pipecat.transports.network.websocket_server",
            "pipecat.transports.fastapi",
            "pipecat.transports.websocket",
            # Sarvam services
            "pipecat.services.sarvam.stt",
            "pipecat.services.sarvam.tts",
            "pipecat.services.sarvam",
            # OpenAI services (for session 2)
            "pipecat.services.openai.llm",
            "pipecat.services.openai",
        ]
        probe = {}
        for path in candidates:
            try:
                mod = __import__(path, fromlist=["*"])
                # List public symbols in the module that look like services/transports.
                symbols = [
                    s for s in dir(mod)
                    if not s.startswith("_")
                    and (
                        "Transport" in s
                        or "Service" in s
                        or "Params" in s
                    )
                ]
                probe[path] = {"ok": True, "symbols": symbols}
            except ModuleNotFoundError as e:
                probe[path] = {"ok": False, "error": "ModuleNotFoundError"}
            except Exception as e:
                probe[path] = {"ok": False, "error": f"{type(e).__name__}: {e}"}

        # Inspect the rtvi module specifically since RTVIConfig was missing.
        rtvi_inspection = {}
        try:
            from pipecat.processors.frameworks import rtvi as rtvi_module
            rtvi_inspection["module_path"] = getattr(rtvi_module, "__file__", "unknown")
            rtvi_inspection["all_exports"] = sorted(
                [s for s in dir(rtvi_module) if not s.startswith("_")]
            )
        except Exception as e:
            rtvi_inspection["error"] = f"{type(e).__name__}: {e}"

        # Also check pipecat.serializers and pipecat.audio.vad while we're here
        serializer_inspection = {}
        try:
            from pipecat import serializers
            for finder, name, ispkg in pkgutil.iter_modules(
                serializers.__path__, prefix="pipecat.serializers."
            ):
                serializer_inspection.setdefault("submodules", []).append(name)
        except Exception as e:
            serializer_inspection["error"] = str(e)

        return {
            "pipecat_version": getattr(pipecat, "__version__", "unknown"),
            "relevant_modules": sorted(relevant),
            "import_probes": probe,
            "rtvi_inspection": rtvi_inspection,
            "serializer_inspection": serializer_inspection,
            "total_module_count": len(all_modules),
        }

    @app.websocket("/ws")
    async def websocket_voice(websocket: WebSocket):
        """Voice session over a WebSocket. See _run_voice_pipeline."""
        await websocket.accept()
        try:
            await _run_voice_pipeline(websocket)
        except Exception as exc:  # noqa: BLE001
            # Log and close — Pipecat exceptions during dev are common and
            # noisy. Surface the message so client-side gets context.
            import traceback

            traceback.print_exc()
            await websocket.send_json({"error": str(exc)})
            await websocket.close()

    return app


# ─── Pipeline construction ────────────────────────────────────────────────────


async def _run_voice_pipeline(websocket: WebSocket) -> None:
    """
    Build and run a Pipecat pipeline (Slice 1):

        Audio in → RTVI → Sarvam Saaras v3 STT → user-context aggregator →
        OpenAI GPT-4o-mini LLM → Sarvam Bulbul v3 TTS → Audio out → assistant-context aggregator

    The agent is Kitchen Mate — a kitchen inventory assistant scoped to the
    Kitchen Inventory app. System prompt embeds the feature catalog so the
    LLM can answer "what can you do" / "how do I X" questions without
    hallucinating features. Tools (real data reads) come in Slice 2.

    See docs/decisions.md ADRs 001–008 for full architectural rationale.
    """

    # Imports kept inside the function so the /health endpoint works even if
    # Pipecat is half-broken — useful while debugging deps.
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.services.sarvam.stt import SarvamSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService
    from pipecat.services.openai.llm import OpenAILLMService
    # Universal LLM context — OpenAILLMContext was removed in recent Pipecat
    # versions in favor of a provider-agnostic LLMContext + LLMContextAggregatorPair.
    # Source: Pipecat GitHub examples + 2026 changelog.
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair,
    )
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketTransport,
        FastAPIWebsocketParams,
    )
    from pipecat.frames.frames import TTSSpeakFrame
    # RTVI bridge for the @pipecat-ai/client-js browser SDK. See Slice 0
    # implementation notes in voice-agent/README.md.
    from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.serializers.protobuf import ProtobufFrameSerializer

    # ── Transport (browser ↔ Pipecat over the WebSocket FastAPI accepted) ──
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            vad_analyzer=SileroVADAnalyzer(),
            serializer=ProtobufFrameSerializer(),
        ),
    )

    # ── STT: Saaras v3 in transcribe mode ──
    # Sarvam's current state-of-the-art STT (Saarika v2.5 is now legacy).
    # mode="transcribe" gives pure transcription in the original language —
    # no translation. Handles English / Hindi / Marathi / code-mixed input
    # without explicit language config.
    stt = SarvamSTTService(
        api_key=os.environ["SARVAM_API_KEY"],
        model="saaras:v3",
        mode="transcribe",
    )

    # ── TTS: Bulbul v3 ──
    # Default voice "shubh" for v3 (was "anushka" for v2). Other v3 voices
    # available per Sarvam dashboard.
    tts = SarvamTTSService(
        api_key=os.environ["SARVAM_API_KEY"],
        model="bulbul:v3",
        voice_id="shubh",
    )

    # ── LLM: GPT-4o-mini ──
    # Cheap + fast + robust function calling (per ADR 003). System prompt
    # embeds the full feature catalog so the agent can describe app
    # capabilities accurately without hallucinating.
    llm = OpenAILLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        model="gpt-4o-mini",
    )

    # ── Context: system prompt with catalog ──
    # LLMContext is the universal context (provider-agnostic). The aggregator
    # pair has .user() and .assistant() methods that wrap the pipeline's
    # input/output sides to maintain conversation state.
    messages = [
        {"role": "system", "content": _build_system_prompt()},
    ]
    context = LLMContext(messages)
    context_aggregator = LLMContextAggregatorPair(context)

    # ── RTVI processor — client/server protocol bridge ──
    rtvi = RTVIProcessor()

    # ── Wire the pipeline ──
    # Order matters:
    #   transport.input() → audio frames arrive
    #   rtvi              → handles client protocol messages
    #   stt               → audio → TranscriptionFrame
    #   user aggregator   → collects transcripts into user-turn messages
    #   llm               → reads context, generates response
    #   tts               → response text → audio frames
    #   transport.output()→ sends audio to client
    #   assistant aggregator → records assistant turn in context
    pipeline = Pipeline(
        [
            transport.input(),
            rtvi,
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
        observers=[RTVIObserver(rtvi)],
    )

    # Greet the user on session start. Removes the "is it listening?"
    # ambiguity that plagues early voice UX. Direct TTSSpeakFrame bypasses
    # the LLM — cheaper and deterministic for a fixed greeting.
    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi_processor):
        await rtvi_processor.set_bot_ready()
        await task.queue_frames([
            TTSSpeakFrame("Hi! I'm Kitchen Mate. What can I help you with?"),
        ])

    runner = PipelineRunner()
    await runner.run(task)
