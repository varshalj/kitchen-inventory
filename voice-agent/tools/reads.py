"""
Direct Supabase read tools for the voice agent.

Per ADR 006, reads bypass the MCP server and query Supabase directly using
the authenticated user's JWT (so RLS applies). Each tool returns a small
dict the LLM can read; hard caps protect against the LLM trying to verbalize
hundreds of rows.

Result shape conventions:
  - count_returned: number of rows in this response
  - total: actual count behind the filter (so agent can say "and 130 more")
  - truncated: bool — true when total > count_returned
  - items: list of row dicts (only the fields the LLM needs to reason about)

Always include `total` and `truncated` even when the result fits, so the
LLM can confidently say "this is the complete list" vs. "here are a few".
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# Local module — sibling of pipeline.py inside the Modal container.
from auth import supabase_as_user


# Hard caps to keep the LLM from drowning in data + token budget under control.
# Per Stage 2 decisions: tool returns up to 20 / 15; system prompt instructs
# the LLM to verbalize at most ~5 items unless explicitly asked.
_MAX_INVENTORY_ROWS = 20
_MAX_EXPIRING_ROWS = 15


async def list_inventory(
    user_token: str,
    category: Optional[str] = None,
    location: Optional[str] = None,
) -> dict[str, Any]:
    """
    List the user's active (non-archived) inventory items.

    Args:
        user_token: Verified Supabase user JWT — the caller (pipeline.py)
                    has already validated this via auth.verify_user_token.
        category: Optional case-insensitive filter (e.g. "dairy", "vegetables").
        location: Optional case-insensitive filter (e.g. "fridge", "pantry").

    Returns: dict with count_returned, total, truncated, filters, items.
    """
    supabase = supabase_as_user(user_token)

    # Count first — single round-trip via head=True, no rows transferred.
    count_query = (
        supabase.table("inventory_items")
        .select("id", count="exact", head=True)
        .eq("archived", False)
    )
    if category:
        count_query = count_query.ilike("category", category)
    if location:
        count_query = count_query.ilike("location", location)
    count_resp = count_query.execute()
    total = count_resp.count or 0

    # Then fetch rows. Most recently added first so verbal summaries
    # surface the freshest context.
    rows_query = (
        supabase.table("inventory_items")
        .select("id, name, category, quantity, unit, location, expiry_date, brand")
        .eq("archived", False)
        .order("added_on", desc=True)
        .limit(_MAX_INVENTORY_ROWS)
    )
    if category:
        rows_query = rows_query.ilike("category", category)
    if location:
        rows_query = rows_query.ilike("location", location)
    rows_resp = rows_query.execute()
    items = rows_resp.data or []

    return {
        "count_returned": len(items),
        "total": total,
        "truncated": total > len(items),
        "filters": {"category": category, "location": location},
        "items": items,
    }


async def get_expiring_soon(
    user_token: str,
    days: int = 3,
) -> dict[str, Any]:
    """
    Get inventory items whose expiry_date is within the next N days.

    Args:
        user_token: Verified Supabase user JWT.
        days: How many days ahead to look. Defaults to 3.

    Returns: dict with count_returned, days_lookahead, items.
    Each item includes `days_left` so the LLM can phrase urgency naturally.
    """
    supabase = supabase_as_user(user_token)

    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    rows_query = (
        supabase.table("inventory_items")
        .select("id, name, category, quantity, unit, location, expiry_date, brand")
        .eq("archived", False)
        .not_.is_("expiry_date", "null")
        .lte("expiry_date", cutoff.isoformat())
        .order("expiry_date")
        .limit(_MAX_EXPIRING_ROWS)
    )
    rows_resp = rows_query.execute()
    items = rows_resp.data or []

    # Annotate with days_left for the LLM.
    enriched = []
    for row in items:
        item = dict(row)
        expiry_str = row.get("expiry_date")
        if expiry_str:
            try:
                # Supabase returns timestamptz as ISO 8601; normalize the
                # trailing Z so fromisoformat is happy on older Pythons.
                expiry = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                delta = expiry - now
                item["days_left"] = delta.days
                # Negative days_left means it's already expired — useful signal.
                item["already_expired"] = delta.total_seconds() < 0
            except ValueError:
                item["days_left"] = None
                item["already_expired"] = None
        enriched.append(item)

    return {
        "count_returned": len(enriched),
        "days_lookahead": days,
        "items": enriched,
    }
