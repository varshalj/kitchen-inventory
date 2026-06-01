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
- Reply in the language of the user's MOST RECENT turn (English, Hindi, \
Marathi, Kannada, Malayalam, Hinglish, etc. all work). If the user \
code-switches mid-conversation, follow their lead — but pick ONE language \
per response. Don't oscillate language sentence-by-sentence within a \
single reply. If a single user utterance mixes languages (Hinglish), pick \
whichever language carries the action/verb and respond in that.

# Output format: PLAIN PROSE ONLY (CRITICAL)

Your output is read aloud by a text-to-speech engine. Markdown formatting \
gets read LITERALLY — "###" becomes "hash hash hash", "**bold**" becomes \
"asterisk asterisk bold". This sounds terrible.

NEVER use any of these in your output:
- Markdown headers (`#`, `##`, `###`)
- Bold or italic markers (`**...**`, `*...*`, `_..._`)
- Bullet lists (`- item`, `* item`, `1. item`)
- Code blocks (backticks)
- Hyperlinks in markdown form (`[text](url)`)
- Raw URLs (https://..., http://...)

INSTEAD: speak normally. If a recipe has a source URL like \
"https://www.youtube.com/watch?v=abc", say something like "from a YouTube \
source" or "you can find the link in the app." Never spell out the URL.

If you want to list items verbally, use natural phrasing: "you have three \
things — eggs, milk, and bread" — NOT "1. eggs\n2. milk\n3. bread".

# Current capabilities (Slice 1 + Slice 2 Stages 1 & 2)
You can:
- Describe what Kitchen Inventory does and explain how to use any feature
- Read data via these tools:
  - `list_inventory` (optionally filtered by category or location)
  - `get_expiring_soon` (items expiring within N days, default 3)
  - `list_shopping` (status: pending / completed / all)
  - `search_inventory(query)` (fuzzy name match across current + archived)
  - `suggest_meals(limit)` (recipes ranked by pantry compatibility)
  - `get_waste_stats(days)` (waste analytics, default 30 days)
  - `list_recipes` (saved recipes; returns ids for chaining)
  - `get_recipe(recipe_id)` (full ingredients + instructions)
- Write data via (all use the strict confirmation flow below):
  - `add_to_shopping_list` (add items to shopping list)
  - `mark_as_consumed` (archive an inventory item; auto-restocks to shopping list)
  - `remove_from_shopping_list` (delete an item from the shopping list)
  - `update_shopping_item` (change quantity, unit, mark as bought, edit notes)

You CANNOT yet:
- Mark inventory items as wasted or rated
- Add or edit inventory items directly (only consume / restock)

For requests outside the supported tools, say so plainly: "I can't do that \
yet — try the app directly."

# Writing data: the strict confirmation pattern (CRITICAL)

ANY write action (currently just `add_to_shopping_list`) MUST follow this \
sequence:

1. Call the tool with `confirm: false` to get a dry-run preview. NEVER \
   call with `confirm: true` on your first attempt — the user hasn't \
   agreed yet.
2. Narrate the preview to the user in one short sentence. Include the \
   inferred quantity and unit so they can correct: "I'll add 1 kilo of \
   atta to your shopping list — confirm?"
3. WAIT for an explicit affirmative. Counts as affirmative: yes, yeah, \
   yep, sure, go ahead, do it, okay, haan, ji, ji haan, kar do, bilkul, \
   theek hai. Does NOT count: maybe, hmm, I'm not sure, ambiguous \
   silence — in those cases, ask again.
4. If the user wants different args (different quantity, unit, name \
   variant), call the tool again with `confirm: false` and the new \
   args. Re-preview. Get fresh affirmation.
5. ONLY THEN call the tool with `confirm: true` and the same args to \
   actually execute. After execution, give a brief acknowledgment: \
   "Done — added to your list."

If the user says "yes" or similar without a pending preview, ask "what \
would you like me to do?" Don't guess.

# Defaults when the user doesn't specify quantity or unit

Use these sensible defaults and surface them in the preview so the user \
can correct:

- quantity: 1 unless specified
- atta / wheat flour: 1 kg
- rice / dal / sugar / salt / flour: 1 kg
- milk: 1 litre
- eggs: 12 pcs (or "a dozen")
- bread: 1 loaf
- fruits (bananas, apples, mangoes, oranges): 1 kg
- vegetables (tomatoes, onions, potatoes): 1 kg unless they're items \
  typically counted (lemon, cucumber: 1 pcs)
- spices / small packets (haldi, garam masala, mustard seeds): 1 packet
- everything else: 1 pcs

These are starting guesses, not rules. The user's correction in the \
preview phase is the source of truth.

# Handling unusual item names (transcription-error guard)

If the transcribed item name is not a typical grocery / food / household \
item — proper nouns ("Mickey", "Sarah"), brand names you don't recognize, \
very short or unusual words that might be Sarvam STT errors — VERIFY the \
item name BEFORE generating a preview. Sarvam can mis-transcribe phrases \
like "make it" as "Mickey", and confidently adding nonsense to the user's \
shopping list is the worst failure mode.

Example:
- User (transcribed): "add Mickey to my list"
- You: "I heard 'Mickey' — that doesn't sound like a typical grocery item. \
  Did you mean something else, or do you actually want Mickey added?"
- Wait for confirmation before previewing.

# Tracking corrections across turns

When the user says "no", "actually", "I meant", they're correcting your \
last preview. Maintain the context of the MOST RECENT pending preview \
and interpret the correction as a modification to it.

Example:
- You: "I'll add 1 dozen eggs to your list — confirm?"
- User: "No, make that 2 instead of a dozen"
- You (correctly): "I'll add 2 pcs of eggs to your list — confirm?" \
  (still about eggs)

If the correction is ambiguous about which item it refers to (multiple \
recent items in play, or "no" without a clear target), ask plainly: \
"You want to change the eggs preview, or add something new?" Don't guess.

# Multi-item ambiguity

If the user references multiple items in one turn ambiguously ("add \
those", "put them on the list", "do both"), do NOT assume a combination. \
Ask: "Just to confirm — are you asking me to add both X and Y, or just \
one of them?" Better to confirm than over-deliver.

# When the user expresses doubt about your information

If the user pushes back on something you just claimed ("are you sure?", \
"I don't think that's right", "I see only one", "that doesn't match \
what's on my screen"), treat it as a signal to RE-VERIFY rather than \
restate. Re-call the relevant read tool (list_inventory, search_inventory, \
list_shopping, list_recipes) fresh and report what comes back. Say \
something like "Let me check again..." then call the tool. \
DON'T just repeat your previous claim more confidently — the user is \
telling you something looks off, and the right move is to look fresh \
data, not double down.

# Disambiguation for inventory items (mark_as_consumed)

`mark_as_consumed` operates on the user's real inventory. If they have \
multiple items with similar names (e.g. two yogurts, two milks), MCP will \
return isError="ambiguous" with a `candidates` list. Each candidate has \
distinguishing info — id, name, brand, quantity, unit, expiry_date, \
location.

**CRITICAL: every candidate is an ACTIVE inventory item.** MCP filters out \
archived items before returning candidates. Do NOT describe any candidate \
as "archived", "consumed", or "removed". Even if a candidate has \
quantity=0 or quantity=null, it is still active and still markable as \
consumed — the user can see it in the app's inventory view. Don't invent \
rules about what's possible: describe only what's in the candidates \
payload (id, name, brand, quantity, unit, expiry_date, location) and let \
the server decide whether the operation succeeds.

When you receive an ambiguous error:

1. DO NOT call mark_as_consumed again with the same args — you'll get the \
   same error.
2. Narrate the candidates to the user with their distinguishing features. \
   Pick the 1-2 most distinguishing fields per candidate (brand + expiry, \
   or location + quantity — whatever differentiates them best). Don't \
   read out every field.
   Example: "I found two yogurts — one Amul from May 28, and one Greek \
   from yesterday. Which one?"
3. Take the user's verbal pick ("the older one", "the Amul one", \
   "yesterday's").
4. Map it back to one of the candidate ids you just received.
5. Call mark_as_consumed AGAIN with `item_id` set to the chosen candidate's \
   id (NOT item_name), and `confirm=false`. The id-based lookup bypasses \
   the ambiguity check.
6. Continue with the normal preview → user confirmation → confirm=true flow.

If the user's pick is itself ambiguous ("the smaller one" but quantities \
are equal), ask for more detail rather than guessing.

# Using tools well
- Prefer calling a tool over guessing. If the user asks "what's expiring?", \
call get_expiring_soon — don't make up items.
- When a tool returns many rows (truncated: true, or total > 5), DO NOT list \
them all verbally. Mention 3–5 representative items and tell the user the \
total count plus where to see the full list in the app.
  - Example: "You have 152 items in your inventory. The newest are tomatoes, \
yogurt, and bread. Open the Inventory page in the app to browse them all."
  - Example: "You have 6 items expiring in the next 3 days, including milk \
in 2 days and spinach tomorrow. Want me to read the rest?"
- If a tool returns an empty list, say so cheerfully: "Nothing's expiring in \
the next few days — you're good." Don't apologize.

# Scope refusal
If asked about anything outside Kitchen Inventory (general questions, news, \
weather, other apps), say: "I can only help with your kitchen — try asking \
what's in your inventory or what's expiring."

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
        """
        Voice session over a WebSocket.

        Auth: browser passes the user's Supabase access token as ?token=<jwt>.
        We verify before accepting the WS — invalid tokens get a clean 4001
        close instead of an in-pipeline exception.
        """
        from auth import InvalidToken, verify_user_token

        # Accept first, then validate. Closing BEFORE accept produces a
        # generic 1006 on the browser side; accepting first lets us send a
        # JSON diagnostic and close with the proper 4001 code.
        await websocket.accept()

        token = websocket.query_params.get("token")
        try:
            claims = verify_user_token(token or "")
        except InvalidToken as e:
            print(f"voice-auth: token rejected — {e}", flush=True)
            try:
                await websocket.send_json({"error": "invalid_token", "message": str(e)})
            except Exception:
                pass
            await websocket.close(code=4001, reason=str(e))
            return

        user_id = claims["sub"]
        print(f"voice-auth: accepted user_id={user_id}", flush=True)
        try:
            await _run_voice_pipeline(websocket, user_token=token, user_id=user_id)
        except Exception as exc:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            try:
                await websocket.send_json({"error": str(exc)})
                await websocket.close()
            except Exception:
                pass

    return app


# ─── Pipeline construction ────────────────────────────────────────────────────


async def _run_voice_pipeline(
    websocket: WebSocket,
    user_token: str,
    user_id: str,
) -> None:
    """
    Build and run a Pipecat pipeline (Slice 1 Stage 2):

        Audio in → RTVI → Sarvam Saaras v3 STT → user-context aggregator →
        OpenAI GPT-4o-mini LLM (with tools) → Sarvam Bulbul v3 TTS →
        Audio out → assistant-context aggregator

    The agent is Kitchen Mate — a kitchen inventory assistant scoped to the
    Kitchen Inventory app. System prompt embeds the feature catalog so the
    LLM can answer feature/how-do-I questions; tools (list_inventory,
    get_expiring_soon) let it answer data questions about the user's actual
    inventory.

    Args:
        websocket: live FastAPI WebSocket; caller has already accept()'d it.
        user_token: verified Supabase user JWT; passed to tools so their
                    queries run under the user's RLS.
        user_id: user UUID (the sub claim from user_token), for logging.

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
    # Function calling schemas. These import paths may drift in Pipecat 1.x;
    # if either fails, /diagnostics + a quick dir() inspection will surface
    # the actual locations.
    from pipecat.adapters.schemas.function_schema import FunctionSchema
    from pipecat.adapters.schemas.tools_schema import ToolsSchema
    from pipecat.frames.frames import TranscriptionFrame
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    # Local tool implementations + logger — sibling modules in the Modal image.
    from tools import reads as tool_reads
    from tools import mcp_writes as tool_writes
    import logger as voice_logger
    import time
    import uuid
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

    # ── Session identity for logging ──
    # Fresh UUID per WebSocket connect (decision A1, ADR 008 Stage 3).
    session_id = str(uuid.uuid4())
    logs_enabled = await voice_logger.is_logging_enabled(user_id)
    print(
        f"voice-session: user_id={user_id} session_id={session_id} "
        f"logs_enabled={logs_enabled}",
        flush=True,
    )
    turn_counter = voice_logger.TurnCounter()

    # ── Tools: read-only direct-Supabase reads (per ADR 006) ──
    # Schema declarations the LLM reads to decide whether/how to call.
    # Match the existing MCP server tool signatures for cross-surface
    # consistency.
    list_inventory_schema = FunctionSchema(
        name="list_inventory",
        description=(
            "List the user's current (non-archived) inventory items. "
            "Use this when asked what they have, what's in their kitchen / "
            "fridge / pantry, or to verify if they own a specific category."
        ),
        properties={
            "category": {
                "type": "string",
                "description": "Filter by category (e.g. 'dairy', 'vegetables'). Optional.",
            },
            "location": {
                "type": "string",
                "description": "Filter by storage location (e.g. 'fridge', 'pantry', 'freezer'). Optional.",
            },
        },
        required=[],
    )

    get_expiring_soon_schema = FunctionSchema(
        name="get_expiring_soon",
        description=(
            "Get inventory items expiring within N days (default 3). "
            "Use this for 'what's expiring', 'what do I need to use up', "
            "'anything going bad' kinds of questions."
        ),
        properties={
            "days": {
                "type": "integer",
                "description": "Days to look ahead. Default 3. Use 7 for 'this week', 1 for 'today/tomorrow'.",
            },
        },
        required=[],
    )

    list_shopping_schema = FunctionSchema(
        name="list_shopping",
        description=(
            "List the user's shopping list. Use for 'what's on my list', "
            "'what do I need to buy', 'what's still to be bought'."
        ),
        properties={
            "status": {
                "type": "string",
                "enum": ["pending", "completed", "all"],
                "description": "Filter by status. Default 'pending' (not yet bought).",
            },
        },
        required=[],
    )

    search_inventory_schema = FunctionSchema(
        name="search_inventory",
        description=(
            "Fuzzy search inventory items by name. Use for 'do I have X?', "
            "'did I buy X recently?', or to find a specific item. Searches "
            "both current and archived items so you can answer about past "
            "purchases too."
        ),
        properties={
            "query": {
                "type": "string",
                "description": "Item name fragment (case-insensitive).",
            },
        },
        required=["query"],
    )

    suggest_meals_schema = FunctionSchema(
        name="suggest_meals",
        description=(
            "Suggest recipes ranked by how well they match the user's current "
            "pantry. Use for 'what should I cook tonight', 'suggest a meal', "
            "'what can I make with what I have'."
        ),
        properties={
            "limit": {
                "type": "integer",
                "description": "Max suggestions (default 5, max 10).",
            },
        },
        required=[],
    )

    get_waste_stats_schema = FunctionSchema(
        name="get_waste_stats",
        description=(
            "Food waste analytics. Returns total wasted items, breakdown by "
            "category and reason. Use for 'how much do I waste', 'what do I "
            "throw away most', 'am I getting better at not wasting food'."
        ),
        properties={
            "days": {
                "type": "integer",
                "description": "Days to look back (default 30, max 365).",
            },
        },
        required=[],
    )

    list_recipes_schema = FunctionSchema(
        name="list_recipes",
        description=(
            "List the user's saved recipes. Returns id + title + metadata. "
            "Use for 'what recipes do I have' / 'what can I cook'. The ids "
            "this returns can be passed to get_recipe for full details."
        ),
        properties={},
        required=[],
    )

    get_recipe_schema = FunctionSchema(
        name="get_recipe",
        description=(
            "Get the full ingredients + instructions for one specific recipe. "
            "Typically called AFTER list_recipes or suggest_meals — use the "
            "id from those results. If the user asks 'tell me about the "
            "biryani', and you've previously listed recipes including "
            "Biryani with id 'abc123', call this with recipe_id='abc123'."
        ),
        properties={
            "recipe_id": {
                "type": "string",
                "description": "Recipe id (UUID) from list_recipes or suggest_meals.",
            },
        },
        required=["recipe_id"],
    )

    # ── Write tools (per ADR 009) ──
    # All writes route through the MCP server. The MCP server enforces
    # dry-run-by-default: call with confirm=false to get a preview, then
    # call again with confirm=true to execute. The system prompt explains
    # the user-facing flow.
    # All write tools share the strict-confirmation rule documented at length
    # in the system prompt. Per-tool descriptions repeat the key bullet so
    # the LLM sees it inline with the schema.
    _CONFIRM_PROPERTY = {
        "type": "boolean",
        "description": (
            "MUST be false on the first call (to get a preview). Only set to "
            "true after the user has verbally agreed to the previewed action."
        ),
    }

    add_to_shopping_list_schema = FunctionSchema(
        name="add_to_shopping_list",
        description=(
            "Add an item to the user's shopping list. STRICT CONFIRMATION: "
            "first call MUST be confirm=false (preview); only call confirm=true "
            "after explicit user affirmation."
        ),
        properties={
            "item_name": {
                "type": "string",
                "description": "Item name (e.g. 'eggs', 'atta', 'paneer').",
            },
            "quantity": {
                "type": "number",
                "description": (
                    "Quantity. If user didn't say, infer (a dozen for eggs, "
                    "1 kg for staples, etc.)."
                ),
            },
            "unit": {
                "type": "string",
                "description": (
                    "Unit. Infer sensible default from item: atta/rice/dal/"
                    "sugar/flour/fruits/vegetables → 'kg'; milk → 'litre'; "
                    "eggs → 'pcs' or 'dozen'; bread → 'loaf'; spices → 'packet'."
                ),
            },
            "confirm": _CONFIRM_PROPERTY,
        },
        required=["item_name"],
    )

    mark_as_consumed_schema = FunctionSchema(
        name="mark_as_consumed",
        description=(
            "Archive an inventory item as consumed (and auto-restock to shopping "
            "list). Use for 'I finished the X' / 'we used up the Y'. STRICT "
            "CONFIRMATION (confirm=false first for preview, then confirm=true). "
            "If MCP returns isError='ambiguous' with a candidates list, narrate "
            "the candidates verbally with distinguishing details (brand, expiry, "
            "location), take the user's pick, then retry with the chosen "
            "candidate's id via the item_id arg (NOT item_name) plus confirm=false."
        ),
        properties={
            "item_name": {
                "type": "string",
                "description": (
                    "Name of the inventory item (normalized match). Use this on "
                    "the first attempt. If MCP returns 'ambiguous', switch to "
                    "item_id on the retry."
                ),
            },
            "item_id": {
                "type": "string",
                "description": (
                    "Direct id lookup. Use this AFTER the user disambiguates "
                    "from a candidates list returned in an earlier ambiguous "
                    "error. Pass the chosen candidate's id here, omit item_name."
                ),
            },
            "quantity": {
                "type": "number",
                "description": (
                    "How many to add back to the shopping list (defaults to "
                    "the item's current inventory quantity)."
                ),
            },
            "confirm": _CONFIRM_PROPERTY,
        },
        required=[],
    )

    remove_from_shopping_list_schema = FunctionSchema(
        name="remove_from_shopping_list",
        description=(
            "Delete an item from the shopping list. Use for 'remove X from my "
            "list' / 'I don't need to buy X anymore'. STRICT CONFIRMATION. "
            "Prefer item_id (from a prior list_shopping call); falls back to "
            "name-match if only item_name is given."
        ),
        properties={
            "item_id": {
                "type": "string",
                "description": "Exact shopping item id (from list_shopping or a prior add).",
            },
            "item_name": {
                "type": "string",
                "description": "Item name (normalized match). Used when item_id isn't known.",
            },
            "confirm": _CONFIRM_PROPERTY,
        },
        required=[],
    )

    update_shopping_item_schema = FunctionSchema(
        name="update_shopping_item",
        description=(
            "Update fields on an existing shopping list item — quantity, unit, "
            "completed status, or notes. Use for 'change milk to 2 cartons', "
            "'mark eggs as bought', 'actually that should be in litres'. STRICT "
            "CONFIRMATION."
        ),
        properties={
            "item_id": {
                "type": "string",
                "description": "Exact shopping item id (preferred).",
            },
            "item_name": {
                "type": "string",
                "description": "Item name (normalized match). Used when id isn't known.",
            },
            "quantity": {
                "type": "number",
                "description": "New quantity. >= 0. Pass 0 only as a soft-clear; usually use remove_from_shopping_list for actual deletes.",
            },
            "unit": {
                "type": "string",
                "description": "New unit.",
            },
            "completed": {
                "type": "boolean",
                "description": "Set true to mark the item as already bought.",
            },
            "notes": {
                "type": "string",
                "description": "Free-form notes to replace existing notes.",
            },
            "confirm": _CONFIRM_PROPERTY,
        },
        required=[],
    )

    tools_schema = ToolsSchema(
        standard_tools=[
            list_inventory_schema,
            get_expiring_soon_schema,
            list_shopping_schema,
            search_inventory_schema,
            suggest_meals_schema,
            get_waste_stats_schema,
            list_recipes_schema,
            get_recipe_schema,
            add_to_shopping_list_schema,
            mark_as_consumed_schema,
            remove_from_shopping_list_schema,
            update_shopping_item_schema,
        ]
    )

    # ── Tool handlers ──
    # Closures over user_token (for RLS) + logging context. Each handler
    # measures latency, logs the call (if logging enabled), and returns the
    # result. Failures inside the tool are caught and surfaced as
    # {"error": "..."} so the LLM can phrase them verbally.
    def _make_tool_handler(tool_name: str, fn):
        """Wrap a tool function with latency timing + voice_session_logs writes."""
        async def _handler(params):
            start_ms = time.perf_counter() * 1000
            args = params.arguments or {}
            try:
                result = await fn(args)
                latency = int(time.perf_counter() * 1000 - start_ms)
                voice_logger.log_turn(
                    enabled=logs_enabled,
                    user_id=user_id,
                    session_id=session_id,
                    turn_number=turn_counter.next(),
                    role="tool",
                    tool_name=tool_name,
                    tool_args=args,
                    tool_result=result,
                    latency_ms=latency,
                )
                await params.result_callback(result)
            except Exception as e:  # noqa: BLE001
                latency = int(time.perf_counter() * 1000 - start_ms)
                err = {"error": str(e), "type": type(e).__name__}
                voice_logger.log_turn(
                    enabled=logs_enabled,
                    user_id=user_id,
                    session_id=session_id,
                    turn_number=turn_counter.next(),
                    role="tool",
                    tool_name=tool_name,
                    tool_args=args,
                    tool_result=err,
                    latency_ms=latency,
                )
                await params.result_callback(err)
        return _handler

    llm.register_function(
        "list_inventory",
        _make_tool_handler(
            "list_inventory",
            lambda a: tool_reads.list_inventory(
                user_token, category=a.get("category"), location=a.get("location")
            ),
        ),
    )
    llm.register_function(
        "get_expiring_soon",
        _make_tool_handler(
            "get_expiring_soon",
            lambda a: tool_reads.get_expiring_soon(
                user_token,
                days=a["days"] if isinstance(a.get("days"), int) and 1 <= a["days"] <= 60 else 3,
            ),
        ),
    )
    llm.register_function(
        "list_shopping",
        _make_tool_handler(
            "list_shopping",
            lambda a: tool_reads.list_shopping(user_token, status=a.get("status", "pending")),
        ),
    )
    llm.register_function(
        "search_inventory",
        _make_tool_handler(
            "search_inventory",
            lambda a: tool_reads.search_inventory(user_token, query=a.get("query", "")),
        ),
    )
    llm.register_function(
        "suggest_meals",
        _make_tool_handler(
            "suggest_meals",
            lambda a: tool_reads.suggest_meals(user_token, limit=a.get("limit", 5)),
        ),
    )
    llm.register_function(
        "get_waste_stats",
        _make_tool_handler(
            "get_waste_stats",
            lambda a: tool_reads.get_waste_stats(user_token, days=a.get("days", 30)),
        ),
    )
    llm.register_function(
        "list_recipes",
        _make_tool_handler("list_recipes", lambda a: tool_reads.list_recipes(user_token)),
    )
    llm.register_function(
        "get_recipe",
        _make_tool_handler(
            "get_recipe",
            lambda a: tool_reads.get_recipe(user_token, recipe_id=a.get("recipe_id", "")),
        ),
    )

    # ── Write tool handlers (route through MCP per ADR 006) ──
    # Same _make_tool_handler wrapper as reads — gets latency + logging for
    # free. The MCP HTTP call returns a structured result either way (dry-run
    # preview or execute confirmation), and the LLM gets that as the tool
    # result to phrase verbally.
    # Helper: forward args verbatim to MCP, defaulting confirm to false
    # (server enforces the same default but being explicit keeps intent clear).
    def _mcp_args(name_or_id_keys, a):
        """Build the args dict for an MCP write call. Drops None values so MCP
        doesn't see explicit nulls for missing optional fields."""
        out = {"confirm": bool(a.get("confirm", False))}
        for key in name_or_id_keys:
            v = a.get(key)
            if v is not None and v != "":
                out[key] = v
        return out

    llm.register_function(
        "add_to_shopping_list",
        _make_tool_handler(
            "add_to_shopping_list",
            lambda a: tool_writes.call_mcp_tool(
                "add_to_shopping_list",
                arguments=_mcp_args(("item_name", "quantity", "unit"), a),
                user_token=user_token,
            ),
        ),
    )

    llm.register_function(
        "mark_as_consumed",
        _make_tool_handler(
            "mark_as_consumed",
            lambda a: tool_writes.call_mcp_tool(
                "mark_as_consumed",
                arguments=_mcp_args(("item_id", "item_name", "quantity"), a),
                user_token=user_token,
            ),
        ),
    )

    llm.register_function(
        "remove_from_shopping_list",
        _make_tool_handler(
            "remove_from_shopping_list",
            lambda a: tool_writes.call_mcp_tool(
                "remove_from_shopping_list",
                arguments=_mcp_args(("item_id", "item_name"), a),
                user_token=user_token,
            ),
        ),
    )

    llm.register_function(
        "update_shopping_item",
        _make_tool_handler(
            "update_shopping_item",
            lambda a: tool_writes.call_mcp_tool(
                "update_shopping_item",
                arguments=_mcp_args(
                    ("item_id", "item_name", "quantity", "unit", "completed", "notes"),
                    a,
                ),
                user_token=user_token,
            ),
        ),
    )

    # ── Context: system prompt with catalog + tools ──
    # LLMContext is the universal context (provider-agnostic). The aggregator
    # pair has .user() and .assistant() methods that wrap the pipeline's
    # input/output sides to maintain conversation state.
    messages = [
        {"role": "system", "content": _build_system_prompt()},
    ]
    context = LLMContext(messages, tools=tools_schema)
    context_aggregator = LLMContextAggregatorPair(context)

    # ── RTVI processor — client/server protocol bridge ──
    rtvi = RTVIProcessor()

    # ── Transcript logging processors (ADR 008, Stage 3) ──
    # UserTurnLogger sits after STT so it sees finalized TranscriptionFrames.
    # AgentTurnLogger sits after the assistant aggregator so it sees the
    # complete assistant message in context.messages (the aggregator appends
    # to context just before this processor runs). Both no-op cheaply when
    # logs_enabled is False.

    class UserTurnLogger(FrameProcessor):
        async def process_frame(self, frame, direction: FrameDirection):
            await super().process_frame(frame, direction)
            if logs_enabled and isinstance(frame, TranscriptionFrame) and frame.text:
                voice_logger.log_turn(
                    enabled=True,
                    user_id=user_id,
                    session_id=session_id,
                    turn_number=turn_counter.next(),
                    role="user",
                    text=frame.text,
                    model="saaras:v3",
                )
            await self.push_frame(frame, direction)

    class AgentTurnLogger(FrameProcessor):
        """Logs the assistant's full response after the aggregator appends it
        to context.messages.

        Also captures user-perceived latency for the agent row: the time
        between UserStoppedSpeakingFrame and LLMContextAssistantTimestampFrame
        — i.e. "how long after I finished talking did the agent finish
        thinking?". This is STT + aggregator + LLM time. TTS playback time
        starts after, so the user hears the response a bit later than this
        number suggests; for "is the agent slow?" debugging this metric is
        the most actionable single number.
        """

        def __init__(self):
            super().__init__()
            # Avoid double-logging if multiple "turn complete" frames fire
            # for one assistant turn.
            self._last_logged_message_count = 0
            # Timestamp (perf_counter ms) when user finished speaking. Reset
            # after each agent turn is logged.
            self._user_stopped_perf_ms = None

        async def process_frame(self, frame, direction: FrameDirection):
            await super().process_frame(frame, direction)
            if logs_enabled:
                name = type(frame).__name__

                # Latency anchor: VAD-detected end of user's utterance.
                if name == "UserStoppedSpeakingFrame":
                    self._user_stopped_perf_ms = time.perf_counter() * 1000

                # Pipecat 1.3.0 emits LLMContextAssistantTimestampFrame
                # immediately after the assistant aggregator appends the
                # complete assistant turn to context.messages. Other historical
                # names kept for forward-compat with future Pipecat versions.
                elif name in (
                    "LLMContextAssistantTimestampFrame",
                    "LLMResponseEndFrame",
                    "LLMFullResponseEndFrame",
                    "OpenAIAssistantContextAggregatorFrame",
                    "LLMMessagesUpdateFrame",
                    "AssistantContextUpdatedFrame",
                ):
                    try:
                        messages = list(context.messages or [])
                        if len(messages) > self._last_logged_message_count:
                            last = messages[-1] if messages else None
                            if (
                                last
                                and last.get("role") == "assistant"
                                and last.get("content")
                            ):
                                latency_ms = None
                                if self._user_stopped_perf_ms is not None:
                                    latency_ms = int(
                                        time.perf_counter() * 1000
                                        - self._user_stopped_perf_ms
                                    )
                                    # Reset so the next turn starts a fresh window
                                    self._user_stopped_perf_ms = None
                                voice_logger.log_turn(
                                    enabled=True,
                                    user_id=user_id,
                                    session_id=session_id,
                                    turn_number=turn_counter.next(),
                                    role="agent",
                                    text=last.get("content"),
                                    latency_ms=latency_ms,
                                    model="gpt-4o-mini",
                                )
                                self._last_logged_message_count = len(messages)
                    except Exception as e:  # noqa: BLE001
                        print(f"voice-logger: agent turn capture failed: {e}", flush=True)
            await self.push_frame(frame, direction)

    user_turn_logger = UserTurnLogger()
    agent_turn_logger = AgentTurnLogger()

    # ── Wire the pipeline ──
    # Order matters:
    #   transport.input()    → audio frames arrive
    #   rtvi                 → handles client protocol messages
    #   stt                  → audio → TranscriptionFrame
    #   user_turn_logger     → logs user transcripts (must be BEFORE the user
    #                          aggregator — the aggregator consumes
    #                          TranscriptionFrame and emits a context frame
    #                          instead, so a logger downstream would never
    #                          see raw transcripts)
    #   user aggregator      → collects transcripts into user-turn messages
    #   llm                  → reads context, generates response
    #   tts                  → response text → audio frames
    #   transport.output()   → sends audio to client
    #   assistant aggregator → records assistant turn in context
    #   agent_turn_logger    → logs agent response (now in context) to logs
    pipeline = Pipeline(
        [
            transport.input(),
            rtvi,
            stt,
            user_turn_logger,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
            agent_turn_logger,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
        observers=[RTVIObserver(rtvi)],
    )

    # Log session boundary so analytics can frame turns by session lifetime.
    voice_logger.log_turn(
        enabled=logs_enabled,
        user_id=user_id,
        session_id=session_id,
        turn_number=turn_counter.next(),
        role="system",
        text="session_started",
        model="saaras:v3+gpt-4o-mini+bulbul:v3",
    )

    # Greet the user on session start. Removes the "is it listening?"
    # ambiguity that plagues early voice UX. Direct TTSSpeakFrame bypasses
    # the LLM — cheaper and deterministic for a fixed greeting.
    GREETING = "Hi! I'm Kitchen Mate. What can I help you with?"

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi_processor):
        await rtvi_processor.set_bot_ready()
        await task.queue_frames([TTSSpeakFrame(GREETING)])
        # The greeting bypasses the LLM, so the AgentTurnLogger won't see
        # it via the context. Log it directly here for completeness.
        voice_logger.log_turn(
            enabled=logs_enabled,
            user_id=user_id,
            session_id=session_id,
            turn_number=turn_counter.next(),
            role="agent",
            text=GREETING,
            model="bulbul:v3 (greeting, no LLM)",
        )

    runner = PipelineRunner()
    await runner.run(task)
