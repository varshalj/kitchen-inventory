"""Voice agent tools.

Per ADR 006: read operations live here as direct Supabase queries (low
latency, no MCP hop). Write operations live in mcp_writes.py and call the
MCP server over HTTP to reuse its dry-run / ambiguity / normalization
safety patterns.
"""
