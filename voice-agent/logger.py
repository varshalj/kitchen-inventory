"""
Voice session logging — writes transcripts, tool calls, and timings to
the voice_session_logs Supabase table.

Per ADR 008: text only (no audio). Gated by feature_grants.voice_logs_enabled
per user (admin-only flip via Supabase dashboard). When disabled, every
log_turn() call is a cheap no-op.

Failure mode: silent. A transient Supabase blip shouldn't kill a voice
conversation, so every insert is wrapped in try/except and runs as a
fire-and-forget asyncio task. Logging failures print to stdout for Modal
log surface but never propagate.

The Supabase Python client is synchronous, so inserts run on a thread
pool via asyncio.to_thread() to avoid blocking the pipeline event loop.
"""

from __future__ import annotations

import asyncio
import os
import threading
from typing import Any, Optional

from supabase import Client, create_client


# ─── Service-role admin client (lazy, singleton) ──────────────────────────────

_admin_client: Optional[Client] = None
_admin_client_lock = threading.Lock()


def _get_admin_client() -> Optional[Client]:
    """
    Lazily build a service-role Supabase client for logging writes.
    Returns None if the required env vars aren't set (logging then no-ops).
    """
    global _admin_client
    if _admin_client is not None:
        return _admin_client
    with _admin_client_lock:
        if _admin_client is not None:
            return _admin_client
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_key:
            print(
                "voice-logger: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY "
                "missing — logging will be a no-op.",
                flush=True,
            )
            return None
        _admin_client = create_client(url, service_key)
        return _admin_client


# ─── Per-session toggle check ─────────────────────────────────────────────────

async def is_logging_enabled(user_id: str) -> bool:
    """
    Check feature_grants.voice_logs_enabled for this user.
    Called once at session start; result is cached for the session.

    Defensive defaults to False on any error — we'd rather not log than
    log when we're not supposed to.
    """
    client = _get_admin_client()
    if client is None:
        return False

    def _check():
        resp = (
            client.table("feature_grants")
            .select("voice_logs_enabled")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return bool(rows and rows[0].get("voice_logs_enabled"))

    try:
        return await asyncio.to_thread(_check)
    except Exception as e:  # noqa: BLE001
        print(f"voice-logger: feature_grants lookup failed for {user_id}: {e}", flush=True)
        return False


# ─── Turn counter (thread-safe-ish, single voice session per instance) ────────

class TurnCounter:
    """Per-session monotonic counter. Used to order voice_session_logs rows
    without relying on created_at (which has millisecond ties under load)."""

    def __init__(self):
        self._n = 0
        self._lock = threading.Lock()

    def next(self) -> int:
        with self._lock:
            self._n += 1
            return self._n


# ─── Fire-and-forget insert ───────────────────────────────────────────────────

def log_turn(
    *,
    enabled: bool,
    user_id: str,
    session_id: str,
    turn_number: int,
    role: str,
    text: Optional[str] = None,
    tool_name: Optional[str] = None,
    tool_args: Any = None,
    tool_result: Any = None,
    latency_ms: Optional[int] = None,
    model: Optional[str] = None,
) -> None:
    """
    Schedule an insert into voice_session_logs. Returns immediately —
    actual insert happens on a worker thread.

    No-op if `enabled` is False (logging disabled for this user).
    """
    if not enabled:
        return

    client = _get_admin_client()
    if client is None:
        return

    row = {
        "user_id": user_id,
        "session_id": session_id,
        "turn_number": turn_number,
        "role": role,
        "text": text,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "tool_result": tool_result,
        "latency_ms": latency_ms,
        "model": model,
    }

    def _blocking_insert():
        try:
            client.table("voice_session_logs").insert(row).execute()
        except Exception as e:  # noqa: BLE001
            # Print but don't propagate — the voice session must keep running.
            print(
                f"voice-logger: insert failed (session={session_id} "
                f"turn={turn_number} role={role}): {e}",
                flush=True,
            )

    # Fire-and-forget. We don't await the task — voice latency wins over
    # log durability.
    try:
        asyncio.create_task(asyncio.to_thread(_blocking_insert))
    except RuntimeError:
        # No running loop (shouldn't happen in our async pipeline context,
        # but be defensive — fall back to a synchronous insert in that case).
        _blocking_insert()
