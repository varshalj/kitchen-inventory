"""
HTTP client for the MCP server's write tools (per ADR 006 + ADR 009).

Voice writes route through the existing MCP server at /api/mcp/mcp to reuse
its dry-run + ambiguity + normalization safety patterns. The MCP server
enforces confirm=false → preview, confirm=true → execute; this module is
just the JSON-RPC adapter that wraps the call and unwraps the result for
the LLM to read.

Auth: passes the user's Supabase JWT as a Bearer token. MCP's auth helper
(lib/mcp/auth.ts) validates it the same way the chat-agent MCP path does,
so the same token that authenticates the voice WebSocket also works here
without re-issuing.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx


# MCP endpoint. In production this points at the deployed Next.js app's
# MCP route. Made env-configurable so we can point at staging or local
# Next.js builds later.
_DEFAULT_MCP_URL = "https://kitchen-inventory-liart.vercel.app/api/mcp/mcp"


def _mcp_url() -> str:
    return os.environ.get("MCP_SERVER_URL", _DEFAULT_MCP_URL)


async def call_mcp_tool(
    tool_name: str,
    arguments: dict[str, Any],
    user_token: str,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    """
    Invoke an MCP tool over HTTP and return its structured result.

    Returns the tool's structured result dict on success. On failures,
    returns {"error": "<code>", "message": "..."} so the LLM can phrase
    a recovery line without crashing the pipeline.

    Failure codes the caller might see:
      - "mcp_unreachable": network error / timeout
      - "unauthorized": MCP rejected the JWT
      - "mcp_error": HTTP non-200 (likely a server bug — message has body excerpt)
      - "mcp_invalid_response": MCP returned non-JSON
      - "mcp_jsonrpc_error": MCP returned a JSON-RPC error object

    On the happy path, returns whatever the MCP tool put in
    `result.structuredContent` (preferred — it's an already-parsed dict)
    or the parsed JSON from `result.content[0].text` as a fallback.
    If MCP set isError=true on the result, that flag is preserved.
    """
    request_body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    headers = {
        "Authorization": f"Bearer {user_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(_mcp_url(), json=request_body, headers=headers)
    except httpx.TimeoutException:
        return {
            "error": "mcp_unreachable",
            "message": f"MCP request timed out after {timeout_seconds}s",
        }
    except httpx.HTTPError as e:
        return {"error": "mcp_unreachable", "message": str(e)}

    if response.status_code == 401:
        return {"error": "unauthorized", "message": "MCP server rejected the user token"}
    if response.status_code != 200:
        return {
            "error": "mcp_error",
            "status": response.status_code,
            "message": response.text[:500],
        }

    try:
        payload = response.json()
    except json.JSONDecodeError as e:
        return {"error": "mcp_invalid_response", "message": str(e)}

    # JSON-RPC envelope: top-level "error" means transport/protocol failure;
    # tool-level errors live inside result.isError + result.content/structuredContent.
    if "error" in payload:
        return {"error": "mcp_jsonrpc_error", "details": payload["error"]}

    result = payload.get("result", {}) or {}
    is_error = bool(result.get("isError"))

    # MCP returns {content: [...], structuredContent?: ..., isError?: bool}.
    # Prefer structuredContent (already a parsed dict) over re-parsing the
    # text content. Both should agree but structured is canonical.
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        out = dict(structured)
        if is_error:
            out["isError"] = True
        return out

    # Fall back to parsing the text content.
    content = result.get("content") or []
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "text":
            try:
                parsed = json.loads(first["text"])
                if is_error:
                    parsed["isError"] = True
                return parsed
            except (json.JSONDecodeError, TypeError):
                return {
                    "text": first.get("text", ""),
                    "isError": is_error,
                }

    # Nothing parseable came back — surface the raw shape for debugging.
    return {"raw": result, "isError": is_error}
