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
    Build and run a Pipecat pipeline:
        Audio in → Sarvam Saarika STT → Echo processor → Sarvam Bulbul TTS → Audio out

    NOTE: The Pipecat imports + class names below are best-effort and may
    need adjustment against the current pipecat-ai version. The shape is
    correct (Pipeline of FrameProcessors, run via PipelineTask), but the
    exact class symbols evolve.
    """

    # Imports kept inside the function so the /health endpoint works even if
    # Pipecat is half-broken — useful while debugging deps.
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.services.sarvam.stt import SarvamSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService
    # Pipecat 1.3.0 reorganized transports — was pipecat.transports.network.*
    # in older versions; now lives under pipecat.transports.websocket.fastapi.
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketTransport,
        FastAPIWebsocketParams,
    )
    from pipecat.frames.frames import TranscriptionFrame, TextFrame, TTSSpeakFrame
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    # RTVI bridge so the @pipecat-ai/client-js browser SDK can talk to us.
    # Without this, FastAPIWebsocketTransport speaks raw Pipecat frames while
    # the client SDK speaks RTVI — websocket connects but audio is silently
    # dropped. Adding RTVIProcessor (in the pipeline) + RTVIObserver (on the
    # PipelineTask) translates between the two protocols.
    # NOTE: RTVIConfig was removed in Pipecat 1.3.0; RTVIProcessor now takes
    # no config arg (or takes individual kwargs). See /diagnostics
    # rtvi_inspection for confirmation.
    from pipecat.processors.frameworks.rtvi import (
        RTVIObserver,
        RTVIProcessor,
    )
    # Voice Activity Detection — STT needs this to know when an utterance
    # ends so it can commit a transcript. Without VAD, Sarvam STT may never
    # emit a TranscriptionFrame even with audio flowing in.
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    # Wire serializer — RTVI client expects protobuf-encoded frames.
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

    # ── STT ──
    # Allowed STT models (per Sarvam error msg on 2026-05-31): saaras:v2.5,
    # saaras:v3, saarika:v2.5. We use saarika (pure STT, no translation);
    # saaras is their translation-aware model.
    stt = SarvamSTTService(
        api_key=os.environ["SARVAM_API_KEY"],
        model="saarika:v2.5",
        language="en-IN",  # tweak / detect later
    )

    # ── Loopback "LLM" — turns the transcript into an echo statement. ──
    # Replace with OpenAILLMService in session 2.
    #
    # Uses TTSSpeakFrame (direct "speak this now") rather than plain
    # TextFrame — Pipecat TTS services don't synthesize raw TextFrames;
    # they expect either TTSSpeakFrame or text wrapped in LLM aggregation
    # markers (LLMResponseStart → LLMTextFrame → LLMResponseEnd).
    class EchoProcessor(FrameProcessor):
        async def process_frame(self, frame, direction: FrameDirection):
            await super().process_frame(frame, direction)
            if isinstance(frame, TranscriptionFrame) and frame.text:
                await self.push_frame(
                    TTSSpeakFrame(f"You said: {frame.text}"),
                    direction,
                )
            else:
                await self.push_frame(frame, direction)

    echo = EchoProcessor()

    # ── TTS ──
    tts = SarvamTTSService(
        api_key=os.environ["SARVAM_API_KEY"],
        voice_id="anushka",   # check Sarvam docs; "Priya"/"Neha" are common picks
        model="bulbul:v2",     # check Sarvam docs for current model identifier
    )

    # ── RTVI processor — handles client/server protocol messages ──
    rtvi = RTVIProcessor()

    # ── Wire the pipeline ──
    # RTVI processor goes immediately after transport.input() so it can
    # intercept and handle RTVI client messages before they reach STT.
    pipeline = Pipeline(
        [
            transport.input(),
            rtvi,
            stt,
            echo,
            tts,
            transport.output(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
        observers=[RTVIObserver(rtvi)],
    )

    # Tell the client we're ready as soon as it signals it is. Without this,
    # the client SDK waits forever for the bot-ready ack.
    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi_processor):
        await rtvi_processor.set_bot_ready()

    runner = PipelineRunner()
    await runner.run(task)
