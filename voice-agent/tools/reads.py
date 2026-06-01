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
_MAX_SHOPPING_ROWS = 30
_MAX_SEARCH_ROWS = 15
_MAX_SUGGESTIONS = 10
_MAX_RECIPES_ROWS = 15


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


async def list_shopping(
    user_token: str,
    status: str = "pending",
) -> dict[str, Any]:
    """
    List the user's shopping list items.

    Args:
        user_token: Verified Supabase user JWT.
        status: 'pending' (default — not yet bought), 'completed', or 'all'.

    Returns: dict with count_returned, total, truncated, status, items.
    """
    supabase = supabase_as_user(user_token)

    if status not in ("pending", "completed", "all"):
        status = "pending"

    # Count
    count_query = supabase.table("shopping_items").select("id", count="exact", head=True)
    if status == "pending":
        count_query = count_query.eq("completed", False)
    elif status == "completed":
        count_query = count_query.eq("completed", True)
    count_resp = count_query.execute()
    total = count_resp.count or 0

    # Rows
    rows_query = (
        supabase.table("shopping_items")
        .select("id, name, quantity, unit, category, completed, added_from, brand, notes, added_on")
        .order("added_on", desc=True)
        .limit(_MAX_SHOPPING_ROWS)
    )
    if status == "pending":
        rows_query = rows_query.eq("completed", False)
    elif status == "completed":
        rows_query = rows_query.eq("completed", True)
    rows_resp = rows_query.execute()
    items = rows_resp.data or []

    return {
        "status": status,
        "count_returned": len(items),
        "total": total,
        "truncated": total > len(items),
        "items": items,
    }


async def search_inventory(
    user_token: str,
    query: str,
) -> dict[str, Any]:
    """
    Fuzzy search inventory items by name across current AND archived items.

    Args:
        user_token: Verified Supabase user JWT.
        query: Substring to search for (case-insensitive).

    Returns: dict with query, count_returned, items. Includes archived items
    so the user can answer "have I had X before?" / "when did I last buy X".
    """
    supabase = supabase_as_user(user_token)

    if not query or not query.strip():
        return {"query": query, "count_returned": 0, "items": [], "error": "empty_query"}

    # ilike with %query% — Postgres-style substring match, case-insensitive.
    rows_resp = (
        supabase.table("inventory_items")
        .select(
            "id, name, category, quantity, unit, location, expiry_date, "
            "archived, archive_reason, brand, added_on, consumed_on, wasted_on"
        )
        .ilike("name", f"%{query.strip()}%")
        # Active items first, then most recently added.
        .order("archived")
        .order("added_on", desc=True)
        .limit(_MAX_SEARCH_ROWS)
        .execute()
    )
    items = rows_resp.data or []

    return {
        "query": query,
        "count_returned": len(items),
        "items": items,
    }


async def suggest_meals(
    user_token: str,
    limit: int = 5,
) -> dict[str, Any]:
    """
    Recipes ranked by pantry compatibility (highest match first).

    Args:
        user_token: Verified Supabase user JWT.
        limit: Max suggestions (default 5, capped at _MAX_SUGGESTIONS).

    Returns: dict with count_returned, suggestions. Each suggestion has a
    `pantry_compatibility_score` 0–1 the agent can verbalize as
    'high/medium/low match' rather than a raw number.
    """
    supabase = supabase_as_user(user_token)

    if not isinstance(limit, int) or limit < 1:
        limit = 5
    limit = min(limit, _MAX_SUGGESTIONS)

    rows_resp = (
        supabase.table("recipes")
        .select(
            "id, title, source_url, source_platform, servings, "
            "total_time_minutes, pantry_compatibility_score, is_bookmark"
        )
        .eq("is_bookmark", False)
        .order("pantry_compatibility_score", desc=True)
        .limit(limit)
        .execute()
    )
    suggestions = rows_resp.data or []

    return {
        "count_returned": len(suggestions),
        "suggestions": suggestions,
    }


async def get_waste_stats(
    user_token: str,
    days: int = 30,
) -> dict[str, Any]:
    """
    Food waste analytics — what's been wasted, by category and reason.

    Args:
        user_token: Verified Supabase user JWT.
        days: Lookback window (default 30).

    Returns: dict with period_days, total_wasted, by_category, by_reason,
    recent_items.
    """
    supabase = supabase_as_user(user_token)

    if not isinstance(days, int) or days < 1:
        days = 30
    days = min(days, 365)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    rows_resp = (
        supabase.table("inventory_items")
        .select("id, name, category, wastage_reason, wasted_on, price")
        .eq("archived", True)
        .eq("archive_reason", "wasted")
        .gte("wasted_on", cutoff)
        .order("wasted_on", desc=True)
        .limit(100)  # cap aggregations to last 100 wasted items in window
        .execute()
    )
    wasted = rows_resp.data or []

    by_category: dict[str, int] = {}
    by_reason: dict[str, int] = {}
    for item in wasted:
        cat = item.get("category") or "uncategorized"
        by_category[cat] = by_category.get(cat, 0) + 1
        reason = item.get("wastage_reason") or "unknown"
        by_reason[reason] = by_reason.get(reason, 0) + 1

    return {
        "period_days": days,
        "total_wasted": len(wasted),
        "by_category": by_category,
        "by_reason": by_reason,
        # Top few specifics in case the agent wants to mention them
        "recent_items": [
            {"name": w["name"], "reason": w.get("wastage_reason"), "wasted_on": w.get("wasted_on")}
            for w in wasted[:5]
        ],
    }


async def list_recipes(user_token: str) -> dict[str, Any]:
    """
    List the user's saved recipes (most recently updated first).

    Returns enough metadata that the agent can describe them and, if asked
    about a specific one, call get_recipe with the right id.
    """
    supabase = supabase_as_user(user_token)

    count_resp = (
        supabase.table("recipes").select("id", count="exact", head=True).execute()
    )
    total = count_resp.count or 0

    rows_resp = (
        supabase.table("recipes")
        .select(
            "id, title, source_url, source_platform, servings, "
            "total_time_minutes, pantry_compatibility_score, is_bookmark, updated_at"
        )
        .order("updated_at", desc=True)
        .limit(_MAX_RECIPES_ROWS)
        .execute()
    )
    recipes = rows_resp.data or []

    return {
        "count_returned": len(recipes),
        "total": total,
        "truncated": total > len(recipes),
        "recipes": recipes,
    }


async def get_recipe(
    user_token: str,
    recipe_id: str,
) -> dict[str, Any]:
    """
    Get the full ingredient list + instructions for one recipe.

    Typically called after list_recipes or suggest_meals — the LLM has the
    recipe_id from the prior tool's results.
    """
    supabase = supabase_as_user(user_token)

    if not recipe_id:
        return {"error": "missing_recipe_id"}

    recipe_resp = (
        supabase.table("recipes")
        .select(
            "id, title, source_url, source_platform, servings, "
            "prep_time_minutes, cook_time_minutes, total_time_minutes, "
            "instructions, notes, image_url"
        )
        .eq("id", recipe_id)
        .limit(1)
        .execute()
    )
    recipe_rows = recipe_resp.data or []
    if not recipe_rows:
        return {"error": "not_found", "recipe_id": recipe_id}
    recipe = recipe_rows[0]

    ingredients_resp = (
        supabase.table("recipe_ingredients")
        .select("name, quantity, unit, preparation, ingredient_group, optional, sort_order")
        .eq("recipe_id", recipe_id)
        .order("sort_order")
        .execute()
    )
    ingredients = ingredients_resp.data or []

    return {
        "recipe": recipe,
        "ingredients": ingredients,
    }
