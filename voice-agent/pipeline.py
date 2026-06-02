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

# Current capabilities (Slice 1 + Slice 2 + Slice 3 Stages 2-4)
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
  - `get_current_view` (the page the user is currently looking at in the app)
- Write data via (all use the strict confirmation flow below):
  - `add_to_shopping_list` (add items to shopping list)
  - `mark_as_consumed` (archive an inventory item; auto-restocks to shopping list)
  - `remove_from_shopping_list` (delete an item from the shopping list)
  - `update_shopping_item` (change quantity, unit, mark as bought, edit notes)
- Navigate the user's browser:
  - `navigate_to(path)` (jump to another page in the app — no preview/confirm)
- Filter / sort the current page:
  - `apply_filter(name, value)` (set one URL search-param — see Filters section)
  - `clear_filters()` (reset all filters/sort on the current page)

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

# Cross-language inventory search (CRITICAL)

Items in the user's inventory may be stored in any of several scripts: \
the user might have added "dahi" via voice, "Dahi" by typing, or "दही" via \
some other path. The Postgres ilike used by search_inventory matches on \
literal substring — it doesn't translate "दही" ↔ "dahi" ↔ "curd" or \
"दूध" ↔ "milk".

When the user asks whether they have an item, especially in a non-English \
language, DON'T fail on the first negative result. Try multiple variants:

1. The literal word the user said (e.g. "दही" if they spoke Devanagari)
2. The English transliteration (e.g. "dahi")
3. Common English synonyms / canonical names (e.g. "curd", "yogurt")
4. For Hindi/Marathi/Kannada/etc. common pantry items, try BOTH the \
script form AND the romanized form as separate calls.

Examples:
- User asks "क्या मेरी इन्वेंटरी में कर्ड है?" → call search_inventory("कर्ड"), \
  then "curd", then "Dahi", then "दही", then "yogurt"
- User asks "do I have ghee?" → "ghee" usually works (commonly stored in \
  English), but if no results, try "घी" too
- User asks "atta hai kya?" → "atta", then "wheat flour", then "आटा"

Only conclude "you don't have X" after exhausting reasonable variants. \
If the user pushes back ("I can see it on my screen"), trust them and \
re-search with broader terms — this is the same "re-verify on doubt" \
rule that applies to all reads.

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

# Page context awareness

The browser pushes the user's current page (URL path + any filters in the \
URL) to you as they navigate. You can read it via `get_current_view` — \
returns `{{path, search_params}}`. The path is an app route like `/` \
(inventory dashboard), `/shopping-list`, `/recipes`, `/profile`, etc.

When to call `get_current_view`:
- User asks "what page am I on?", "where am I?", "what am I looking at?" \
  → call it and answer naturally. Don't read out the raw path; translate it \
  into the human name. `/` → "the inventory dashboard"; `/shopping-list` \
  → "your shopping list"; `/recipes` → "your recipes"; `/profile` → \
  "your profile".
- User says "this list", "this item", "here", "this one" and it's not \
  obvious which screen they mean → call `get_current_view` first to ground \
  the reference, then proceed.
- If `path` is null / unknown (no context yet), say so plainly: "I don't \
  know which page you're on yet — give me a second."

Don't call `get_current_view` reflexively at the start of every \
conversation. Only when the user's question is location-dependent.

# Navigation (the navigate_to tool)

When the user asks to GO somewhere ("take me to the shopping list", \
"open recipes", "go home", "show me my profile", "go back to inventory"), \
call `navigate_to(path)` with the right route. Do NOT preview or ask \
"are you sure?" — voice navigation is collaborative, just go.

Path mapping (common phrasings → route). CRITICAL: the app's inventory \
dashboard is at `/dashboard`, NOT `/`. The bare `/` is the unauthenticated \
landing page and will bounce signed-in users through /auth → /dashboard, \
which is an awkward UX. Always use `/dashboard` for the home/inventory screen.

- "home" / "inventory" / "dashboard" / "main screen" → `/dashboard`
- "shopping list" / "shopping" / "what I need to buy" → `/shopping-list`
- "recipes" / "saved recipes" / "what can I cook" → `/recipes`
- "profile" / "my account" / "settings" → `/profile`
- "analytics" / "waste stats" / "how much am I wasting" → `/analytics`
- "archived" / "consumed items" / "history" → `/archived`

After calling `navigate_to`, give a SHORT tense-neutral acknowledgment: \
"Done." or "There you go." or "Sure thing." Don't say "Taking you to X" \
in present tense — the navigation message reaches the browser in ~100ms \
but your verbal reply trails by 1-2 seconds (LLM + TTS latency), so by \
the time the user hears "taking you", they're already on the new page \
and it sounds like you're narrating a future that's already happened. \
Past-tense or neutral phrasing works regardless of which lands first.\
\
\
Don't go silent — a short ack confirms the request was heard.

Do NOT navigate to: `/add-item` (focused task, user has to open it \
themselves), `/auth`, `/authorize`, `/privacy`, `/terms` (out-of-app \
routes), or bare `/` (landing page — bounces signed-in users awkwardly; \
use `/dashboard` instead). If the user asks for one of these, say "you'll \
need to open that yourself — I can't drop you into it."

Don't navigate without an explicit request. If the user asks "what's on \
my shopping list?", READ the list and answer — don't auto-navigate. Voice \
should answer in-place when it can.

# Filters and sort (the apply_filter / clear_filters tools)

Use `apply_filter(name, value)` to narrow what the user sees on their \
CURRENT page. Use `clear_filters()` to reset everything back to defaults. \
Don't preview or confirm — these are cheap, reversible UI tweaks.

If the user wants a filter on a DIFFERENT page than the one they're on, \
call `navigate_to(target_path)` first, then `apply_filter(...)`. Two \
tool calls is fine.

## Supported filters per page

`/dashboard` (inventory dashboard — NOT `/`):
- `filter` accepts: "all", "expired", "expiring-soon", "missing-expiry", \
  or any category name like "Vegetables", "Dairy", "Fruits", "Grains", \
  "Spices", "Beverages" (capitalize the category)
- `sort` accepts: "expiryDate" (default), "addedOn", "name", "category", \
  "location"

`/analytics`:
- `timeframe` accepts: "week", "month" (default), "quarter", "year"

`/archived`:
- `tab` accepts: "all" (default), "consumed", "wasted", "other"

`/shopping-list`, `/recipes`, `/profile` and other pages do NOT currently \
support voice-driven filters — their sort/view state lives in component \
local state, not the URL. If the user asks for one of those, say "you'll \
have to tap the filter on that page yourself for now."

## Mapping common phrasings → (name, value)

Treat ANY of these phrasings as a request to call `apply_filter`, NOT a \
request to read out the list verbally. The user wants the UI to change. \
Examples that all map to `apply_filter("filter", "expiring-soon")` on \
the inventory dashboard:
- "show me what's expiring"
- "filter the UI for expiring items"
- "filter to expiring"
- "narrow it down to expiring"
- "just the ones expiring soon"

Examples that all map to `apply_filter("filter", "expired")`:
- "show expired items"
- "filter the UI for items that are expired"
- "filter for expired"
- "just the expired ones"

Category filters → `apply_filter("filter", "Dairy")` / "Vegetables" / etc. \
(capitalize the category):
- "only dairy" / "just vegetables" / "filter to dairy"

Other common mappings:
- "show items missing expiry dates" → `apply_filter("filter", "missing-expiry")`
- "sort by name" → `apply_filter("sort", "name")`
- "sort by when I added them" → `apply_filter("sort", "addedOn")`
- "this week" / "last week" (on analytics) → `apply_filter("timeframe", "week")`
- "show consumed items" (on archived) → `apply_filter("tab", "consumed")`
- "clear the filter" / "show everything" / "reset" → `clear_filters()`

CRITICAL: when the user asks you to filter the UI, you MUST call \
`apply_filter` — don't just say "Done" verbally without dispatching the \
tool. The agent saying "Done" without actually calling the tool means \
the UI doesn't change and the user is confused.

After applying a filter, give a short tense-neutral acknowledgment like \
"Done." or "Filtered to expiring items." — same timing-lag concern as \
`navigate_to`. Don't say "I'm filtering…" in present tense.

# Toasts on writes (automatic — no tool call needed)

When you successfully execute a write (confirm=true returns success), \
the app automatically shows a toast notification to the user — they get \
a visual confirmation in addition to your verbal one. You don't need to \
do anything special; just narrate the action verbally as usual ("Done — \
added to your list"). The toast is automatic.

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

    # Slice 3 Stage 2: page context inbound. Browser pushes the current
    # pathname + search_params via RTVI `sendClientMessage("page_context", ...)`
    # on connect and on every route change. The server stashes the latest
    # value in `session_state` (below). `get_current_view` reads it.
    get_current_view_schema = FunctionSchema(
        name="get_current_view",
        description=(
            "Get the page the user is currently looking at in the app. "
            "Returns {path, search_params}. Use ONLY when the user asks "
            "where they are ('what page am I on?', 'where am I?') or "
            "references the current view ambiguously ('this list', 'this "
            "item', 'here') and you need to ground the reference. Don't "
            "call this reflexively for every turn."
        ),
        properties={},
        required=[],
    )

    # Slice 3 Stage 3: outbound navigation. The agent can navigate the
    # user's browser to a different app route. Server emits an RTVI
    # server-message ({type: "navigate_to", data: {path}}) via
    # `rtvi.send_server_message`; browser's onServerMessage handler
    # invokes Next.js router.push. No allowlist per ADR 010 — the agent
    # acts under the user's identity, same trust as the user navigating
    # manually. Prompt-level guardrails keep it from jumping into
    # focused-task surfaces (/add-item) or auth flows.
    navigate_to_schema = FunctionSchema(
        name="navigate_to",
        description=(
            "Navigate the user's browser to a different page in the app. "
            "Call this when the user explicitly asks to go somewhere "
            "('take me to the shopping list', 'open recipes', 'go home', "
            "'show me my profile'). Don't preview or confirm — just "
            "navigate. The browser pushes the new route immediately."
        ),
        properties={
            "path": {
                "type": "string",
                "description": (
                    "Target app route — leading slash required, no domain, "
                    "no query string. Valid examples: '/', '/shopping-list', "
                    "'/recipes', '/profile', '/analytics'. Use the same "
                    "shape returned by get_current_view. NEVER pass: "
                    "'/add-item' (focused task), '/auth', '/authorize', "
                    "'/privacy', '/terms' (out-of-app routes)."
                ),
            },
        },
        required=["path"],
    )

    # Slice 3 Stage 4: filter manipulation. Server emits an RTVI
    # `apply_filter` or `clear_filters` server-message; browser reads
    # the current useSearchParams, builds new params, router.pushes.
    # The set of valid (page, param, value) tuples is documented in
    # the system prompt under "Filters" so the LLM picks correctly.
    apply_filter_schema = FunctionSchema(
        name="apply_filter",
        description=(
            "Set a URL search parameter on the user's current page to "
            "filter/sort/view what they see. Use when the user asks to "
            "narrow down the list ('show me only dairy', 'just the "
            "expiring items', 'sort by name', 'show last week's data'). "
            "Operates on the CURRENT page only — if the user wants the "
            "filter on a different page, call navigate_to first, then "
            "apply_filter. Don't preview/confirm — just apply."
        ),
        properties={
            "name": {
                "type": "string",
                "description": (
                    "URL search-param name. See system prompt 'Filters' "
                    "section for which names work on which page. Common: "
                    "'filter', 'sort', 'timeframe', 'tab'."
                ),
            },
            "value": {
                "type": "string",
                "description": (
                    "URL search-param value. Must match one of the "
                    "allowed values for the given name on the current "
                    "page (see 'Filters' section). Pass as a string even "
                    "for things that look numeric — URL params are "
                    "strings."
                ),
            },
        },
        required=["name", "value"],
    )

    clear_filters_schema = FunctionSchema(
        name="clear_filters",
        description=(
            "Remove ALL URL search parameters on the user's current "
            "page, resetting filters and sort to defaults. Use when the "
            "user says 'clear filters', 'reset', 'show everything', "
            "'never mind that filter'. Operates on the current page only."
        ),
        properties={},
        required=[],
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
            get_current_view_schema,
            navigate_to_schema,
            apply_filter_schema,
            clear_filters_schema,
            add_to_shopping_list_schema,
            mark_as_consumed_schema,
            remove_from_shopping_list_schema,
            update_shopping_item_schema,
        ]
    )

    # ── Per-session client-pushed state ──
    # Holds the latest page_context message sent by the browser via RTVI
    # `sendClientMessage("page_context", {path, search_params})`. The
    # on_client_message handler (registered with `rtvi` further down)
    # mutates this dict; the get_current_view tool handler reads from it.
    # Mutable dict (not just a variable) so closures see the live value.
    session_state: dict[str, object] = {"page_context": None}

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

    # ── get_current_view — reads browser-pushed page context (Slice 3 S2) ──
    # No HTTP / DB hit; just reads session_state which the on_client_message
    # handler keeps fresh. Wrapped in _make_tool_handler for free latency
    # logging — the latency will be ~0ms, which is itself useful signal
    # that the LLM is asking for cheap context, not a real read.
    async def _get_current_view(_args):
        ctx = session_state.get("page_context")
        if not ctx:
            # No page_context received yet (cold start race, or client
            # disconnected before sending). Tell the LLM plainly so it
            # can apologize naturally rather than guess.
            return {
                "path": None,
                "search_params": {},
                "note": "no page context received yet",
            }
        return ctx

    llm.register_function(
        "get_current_view",
        _make_tool_handler("get_current_view", _get_current_view),
    )

    # ── navigate_to — emits server→client RTVI message (Slice 3 S3) ──
    # The agent calls this with a target path; we forward to the browser
    # via `rtvi.send_server_message`. The browser's onServerMessage
    # handler (see hooks/use-voice-session.ts) dispatches to
    # router.push(). We deliberately don't validate against an
    # allowlist (per ADR 010) — the agent is acting under the user's
    # identity, same nav scope as the user themselves. We do block a
    # few non-app routes at the system-prompt level (HIDDEN_PATHS on
    # the browser side: /add-item focused task, /auth flows, marketing
    # pages) and reject obviously bad shapes here as a defensive
    # second layer.
    _NAVIGATE_BLOCKED_PATHS = {
        # `/` is the unauthenticated landing page (app/page.tsx returns
        # <LandingPage />). Signed-in users browsing the app live at
        # /dashboard. Voice should never push the user to landing — it
        # bounces through /auth and ends up at /dashboard with a confusing
        # transition. If the agent says "go home", the right target is
        # /dashboard, enforced by both the system prompt mapping and this
        # blocklist.
        "/",
        "/add-item",
        "/auth",
        "/authorize",
        "/landing-preview",
        "/privacy",
        "/terms",
    }

    async def _navigate_to(args):
        raw = args.get("path")
        if not isinstance(raw, str) or not raw.strip():
            return {"error": "path is required"}
        path = raw.strip()
        # Reject domains / protocols — relative app routes only.
        if "://" in path or path.startswith("//"):
            return {"error": "external URLs not allowed; pass an app route like '/shopping-list'"}
        # Normalize: leading slash, strip trailing whitespace, drop any
        # ?query the agent might tack on (filters belong to apply_filter
        # in Stage 4; navigate_to is route-only).
        if not path.startswith("/"):
            path = "/" + path
        if "?" in path:
            path = path.split("?", 1)[0]
        # Final guard: routes the agent shouldn't drop the user into.
        if path in _NAVIGATE_BLOCKED_PATHS:
            return {
                "error": (
                    f"path '{path}' is not navigable via voice. Tell the user "
                    "to open that screen themselves."
                ),
            }
        try:
            await rtvi.send_server_message(
                {"type": "navigate_to", "data": {"path": path}}
            )
        except Exception as e:  # noqa: BLE001
            # Browser-side handler might've torn down; surface so the
            # LLM phrases something useful rather than claiming success.
            print(f"voice-nav: send_server_message failed: {e}", flush=True)
            return {"error": f"could not dispatch navigation: {e}"}
        return {"ok": True, "path": path, "note": "navigation dispatched to browser"}

    llm.register_function(
        "navigate_to",
        _make_tool_handler("navigate_to", _navigate_to),
    )

    # ── apply_filter / clear_filters (Slice 3 Stage 4) ──
    # Both emit RTVI server-messages the browser dispatches to URL
    # search-param updates. No allowlist on (name, value) — the system
    # prompt tells the LLM what works where, and the browser silently
    # ignores params that don't apply on the current page. Cheap and
    # forgiving.
    async def _apply_filter(args):
        name = args.get("name")
        value = args.get("value")
        if not isinstance(name, str) or not name.strip():
            return {"error": "name is required"}
        if not isinstance(value, str):
            # Numeric or boolean came through — coerce to string. URL
            # params are strings on the wire anyway.
            value = str(value) if value is not None else ""
        if not value.strip():
            return {"error": "value is required (use clear_filters to remove a filter)"}
        try:
            await rtvi.send_server_message(
                {
                    "type": "apply_filter",
                    "data": {"name": name.strip(), "value": value.strip()},
                }
            )
        except Exception as e:  # noqa: BLE001
            print(f"voice-filter: apply_filter send failed: {e}", flush=True)
            return {"error": f"could not dispatch filter: {e}"}
        return {"ok": True, "name": name.strip(), "value": value.strip()}

    async def _clear_filters(_args):
        try:
            await rtvi.send_server_message(
                {"type": "clear_filters", "data": {}}
            )
        except Exception as e:  # noqa: BLE001
            print(f"voice-filter: clear_filters send failed: {e}", flush=True)
            return {"error": f"could not dispatch clear: {e}"}
        return {"ok": True}

    llm.register_function(
        "apply_filter",
        _make_tool_handler("apply_filter", _apply_filter),
    )
    llm.register_function(
        "clear_filters",
        _make_tool_handler("clear_filters", _clear_filters),
    )

    # ── Toast emission helper (Slice 3 S3) ──
    # After a successful confirm=true write, automatically emit a toast
    # RTVI message so the user sees a visual confirmation in addition
    # to the agent's verbal "Done — added to your list." On dry-run
    # (confirm=false) or on any error return, no toast — toasts mean
    # "something just happened in your data."
    def _toast_for_write(mcp_tool: str, args: dict) -> dict | None:
        """Build a toast payload for a successful write. Returns None if
        the tool isn't toast-worthy (shouldn't happen — every write
        currently has a mapping). Title/description are short and
        speak-natural in case the user reads them aloud."""
        item = (args.get("item_name") or "item").strip() or "item"
        if mcp_tool == "add_to_shopping_list":
            qty = args.get("quantity")
            unit = (args.get("unit") or "").strip()
            qty_part = f"{qty} {unit}".strip() if qty is not None else ""
            desc = f"{qty_part} {item}".strip() if qty_part else item
            return {
                "kind": "success",
                "title": "Added to shopping list",
                "description": desc,
            }
        if mcp_tool == "mark_as_consumed":
            return {"kind": "success", "title": "Marked as consumed", "description": item}
        if mcp_tool == "remove_from_shopping_list":
            return {"kind": "success", "title": "Removed from shopping list", "description": item}
        if mcp_tool == "update_shopping_item":
            return {"kind": "success", "title": "Shopping list updated", "description": item}
        return None

    def _is_mcp_error(result: object) -> bool:
        """Heuristic: MCP write returns surface errors a few different ways."""
        if not isinstance(result, dict):
            return True
        return bool(result.get("error") or result.get("isError"))

    def _write_with_toast(mcp_tool_name: str, arg_keys: tuple[str, ...]):
        """Wraps an MCP write call so a successful execute emits a toast.

        Returned async fn matches the shape _make_tool_handler expects:
        `async (args_dict) -> result_dict`. Dry-runs and errors are
        forwarded unchanged — no toast in those cases.
        """
        async def _do(args):
            result = await tool_writes.call_mcp_tool(
                mcp_tool_name,
                arguments=_mcp_args(arg_keys, args),
                user_token=user_token,
            )
            confirm = bool(args.get("confirm", False))
            if confirm and not _is_mcp_error(result):
                toast_data = _toast_for_write(mcp_tool_name, args)
                if toast_data:
                    try:
                        await rtvi.send_server_message(
                            {"type": "toast", "data": toast_data}
                        )
                    except Exception as e:  # noqa: BLE001
                        # Non-fatal — the LLM still narrates verbally.
                        print(f"voice-toast: emit failed for {mcp_tool_name}: {e}", flush=True)
            return result
        return _do

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
            _write_with_toast(
                "add_to_shopping_list",
                ("item_name", "quantity", "unit"),
            ),
        ),
    )

    llm.register_function(
        "mark_as_consumed",
        _make_tool_handler(
            "mark_as_consumed",
            _write_with_toast(
                "mark_as_consumed",
                ("item_id", "item_name", "quantity"),
            ),
        ),
    )

    llm.register_function(
        "remove_from_shopping_list",
        _make_tool_handler(
            "remove_from_shopping_list",
            _write_with_toast(
                "remove_from_shopping_list",
                ("item_id", "item_name"),
            ),
        ),
    )

    llm.register_function(
        "update_shopping_item",
        _make_tool_handler(
            "update_shopping_item",
            _write_with_toast(
                "update_shopping_item",
                ("item_id", "item_name", "quantity", "unit", "completed", "notes"),
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

    # Import frame types needed by WireFrameFilter. These are stable
    # public Pipecat exports; if they move in a future version the AST
    # check + /diagnostics will surface it.
    from pipecat.frames.frames import (
        TextFrame as _PCTextFrame,
        TranscriptionFrame as _PCTranscriptionFrame,
        InterruptionFrame as _PCInterruptionFrame,
    )

    class WireFrameFilter(FrameProcessor):
        """Drops frame types that @pipecat-ai/websocket-transport@1.6.5
        deserialize() doesn't recognize.

        The JS client's protobuf knows 4+ oneof variants on the wire
        (text, audio, transcription, message, interruption…) but the
        deserializer in @pipecat-ai/websocket-transport@1.6.5 ONLY
        handles `audio` and `message`. Anything else throws
        `Unknown frame kind` in the browser console (and the message is
        dropped, so any real signal it carried is lost).

        Frame types that need dropping before transport.output():
          - `TextFrame` and subclasses (LLMTextFrame, TTSTextFrame, etc.)
            — TTS / LLM emit these as streaming markers; the user-facing
            text already travels via RTVI's BotLLMTextMessage in the
            `message` oneof so dropping bare frames loses nothing.
          - `TranscriptionFrame` and subclasses (InterimTranscriptionFrame
            etc.) — same story; UserTranscriptionMessage carries the
            user-facing payload.
          - `InterruptionFrame` — Pipecat's interruption signaling.
            Internal pipeline signal, not something the browser needs to
            render. JS client doesn't handle the `interruption` oneof.

        Place this processor *immediately before* transport.output() in
        the pipeline. Only filters downstream-bound traffic.
        """

        # Subclasses are caught via isinstance — e.g. LLMTextFrame,
        # TTSTextFrame inherit from TextFrame; InterimTranscriptionFrame
        # inherits from TranscriptionFrame. Add new types here when a
        # future Pipecat release adds a new oneof variant we'd otherwise
        # leak as "Unknown frame kind".
        _DROP_TYPES = (_PCTextFrame, _PCTranscriptionFrame, _PCInterruptionFrame)

        async def process_frame(self, frame, direction: FrameDirection):
            await super().process_frame(frame, direction)
            if direction == FrameDirection.DOWNSTREAM and isinstance(
                frame, self._DROP_TYPES
            ):
                return
            await self.push_frame(frame, direction)

    wire_frame_filter = WireFrameFilter()

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
    #   wire_frame_filter    → drops bare TextFrame/TranscriptionFrame that
    #                          would otherwise hit the protobuf serializer
    #                          and surface as "Unknown frame kind" in the JS
    #                          client console (Slice 3 Stage 3 fix)
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
            wire_frame_filter,
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

    @rtvi.event_handler("on_client_message")
    async def on_client_message(rtvi_processor, msg):
        """Handle arbitrary client → server RTVI messages.

        Currently the only message type is `page_context`, sent by the
        browser on connect + every route change (see use-voice-session
        sendClientMessage wrapper + voice-mic-button effect). We stash
        the latest payload in session_state for get_current_view to read.

        msg shape: pipecat.processors.frameworks.rtvi.models.ClientMessage
        with `.type: str` and `.data: Any | None`. Anything other than
        `page_context` is ignored — future message types (Stage 3+) plug
        in by adding branches here.
        """
        try:
            if msg.type == "page_context" and isinstance(msg.data, dict):
                session_state["page_context"] = msg.data
                # One-line log so we can sanity-check from `modal app logs`
                # that updates are flowing. Don't log full payload — paths
                # can carry id-shaped segments we'd rather not echo.
                path = msg.data.get("path")
                print(f"voice-context: page_context updated path={path}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"voice-context: on_client_message error: {e}", flush=True)

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
