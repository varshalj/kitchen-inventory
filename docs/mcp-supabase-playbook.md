# MCP + Supabase JWT — implementation playbook

Portable instructions for a **Next.js (App Router)** app using **Supabase** with **JWT in `Authorization: Bearer`**, **read-only MCP tools**, and clients like **Cursor / Claude Desktop** via **`mcp-remote --transport http-only`**.

This document is **self-contained**: you do not need access to any other repository. A reference implementation exists in the **kitchen-inventory** project (same patterns described here).

**Confirmed assumptions for your greenfield app**

- Auth: **Supabase JWT** (not cookie-only session for MCP requests).
- Hosting: **not decided yet** — see [Local development](#local-development) until you deploy.
- Tools: **read-only** for now.

---

## Mental model

1. **OAuth discovery** — MCP clients that support OAuth need to know *where* to send the user and which server issues tokens. You expose **`/.well-known/oauth-protected-resource`** pointing at **Supabase Auth** (`…/auth/v1`).
2. **Every MCP JSON-RPC POST** — The remote runner sends **`Authorization: Bearer <access_token>`**. Your API validates that JWT with Supabase and builds a **Supabase client scoped to that user** so **RLS** applies.
3. **User consent (optional but typical)** — When a client starts OAuth, Supabase may redirect the user to your **`/authorize`** page with an **`authorization_id`**. That page (logged-in user) calls Supabase **`oauth.*`** helpers to approve or deny, then redirects back.

You can implement (1) + (2) first and add (3) when you wire the Supabase Dashboard MCP/OAuth client.

---

## Dependencies

- **`@supabase/supabase-js`** (you likely already have it).
- **`mcp-handler`** — used only for **`protectedResourceHandler`** (and optional **CORS OPTIONS** for metadata). Example version pin from reference: `^1.0.7`.

---

## Environment variables

Required for the patterns below:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The MCP auth helper uses the **anon** key with the **user’s Bearer token** in global headers, then **`getUser(accessToken)`** to validate the JWT.

---

## 1. OAuth protected resource metadata

**Path:** `app/.well-known/oauth-protected-resource/route.ts`

Purpose: MCP-compatible clients discover **`resource_metadata`** and learn the **authorization server** URL.

Pattern:

- Import **`protectedResourceHandler`** and optionally **`metadataCorsOptionsRequestHandler`** from **`mcp-handler`**.
- Set **`authServerUrls`** to **`[`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1`]`** (no trailing slash quirks — match your real Supabase project URL).
- Export **`GET`** as the handler and **`OPTIONS`** as the CORS handler if you need cross-origin metadata fetches.

If `NEXT_PUBLIC_SUPABASE_URL` is missing at build/runtime, use a safe fallback only for local dev; production should always have the real URL.

---

## 2. MCP JSON-RPC route (Streamable HTTP, stateless POST)

**Path (recommended shape):** `app/api/mcp/[transport]/route.ts`  
**Public URL:** **`/api/mcp/mcp`** — the last segment is often literally **`mcp`** because many configs use that path; align your folder segment or a fixed route so the **documented URL** matches what you put in `mcp-remote`.

### POST behavior

1. Read **`Authorization`** header; authenticate (see §3). On failure → **401** JSON body + **`WWW-Authenticate`** (see below).
2. **`await req.json()`** — accept a **single JSON-RPC object** or a **batch array**.
3. Dispatch at least:
   - **`initialize`** — return `protocolVersion` (e.g. `2024-11-05`), `capabilities.tools`, `serverInfo`.
   - **`tools/list`** — return `{ tools: TOOL_DEFINITIONS }`.
   - **`tools/call`** — read `params.name`, `params.arguments`; run your read-only handlers with the **authenticated Supabase client**.
   - **`ping`** — return `{}` if you want compatibility with simple health checks.
4. **Notifications** (JSON-RPC messages **without** `id`): return **`204 No Content`** (or omit from batch results).
5. **Unknown method:** JSON-RPC error **`-32601`** (method not found).

### Tool definition shape

Use **plain JSON Schema objects** in TypeScript (no Zod in this layer) to avoid bundler/Turbopack pain and keep the route bundle predictable.

### `tools/call` errors

For tool failures, prefer returning a **successful JSON-RPC result** whose payload includes **`isError: true`** and text content (e.g. JSON string with `error`), rather than only throwing and mapping to HTTP 500 — clients expect MCP-shaped results.

### GET behavior

For **`mcp-remote --transport http-only`**, traffic is **POST**. **GET** can return **405** with a short JSON message (“use POST”) and still attach **`WWW-Authenticate`** with **`resource_metadata`** so debugging and discovery stay consistent.

### 401 + `WWW-Authenticate` (critical)

On auth failure, return something like:

- **`WWW-Authenticate`:** `Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`

Use the **request origin** (or your canonical public base URL in production) so **`resource_metadata`** is an absolute URL clients can fetch.

Without this header, many clients **will not** start OAuth discovery and you will chase mysterious 401s.

---

## 3. Bearer authentication helper

**Suggested path:** `lib/mcp/auth.ts`

Logic:

1. Require header **`Authorization: Bearer <token>`**.
2. `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })`
3. `const { data: { user }, error } = await supabase.auth.getUser(accessToken)`
4. If `error` or no `user`, throw (caller maps to 401).
5. Return `{ supabase, userId, userEmail }` for use in tool handlers.

**Do not** rely on browser cookies for MCP: the **`mcp-remote`** process typically only forwards the **Bearer** token.

---

## 4. Read-only tool router

**Suggested path:** `lib/mcp/tools.ts`

- Switch on `toolName`, parse `args`, call your existing server-side data layer (repositories, `createServerClient`, etc.) **using the Supabase client from auth** — same as REST/RSC, so RLS stays correct.
- Return MCP content shape, e.g. `{ content: [{ type: "text", text: JSON.stringify(payload) }] }`.

Keep tools **read-only** until you deliberately add mutations, scopes, and stricter consent copy.

---

## 5. Authorize page (Supabase MCP OAuth)

**Path:** `app/authorize/page.tsx` (or the path Supabase expects for your OAuth client)

Flow:

1. Read **`authorization_id`** from query string. If missing, show a clear error (this page is not for manual bookmarking).
2. **`supabase.auth.getUser()`** — if no session, redirect to your sign-in page with **`next`** set to return to the full authorize URL.
3. Call **`supabase.auth.oauth.getAuthorizationDetails(authorizationId)`** (SDK surface may be typed loosely — reference uses `(supabase.auth as any).oauth...` if types lag docs).
4. Approve: **`oauth.approveAuthorization(authorizationId)`** → redirect to **`data.redirect_to`**.
5. Deny: **`oauth.denyAuthorization(authorizationId)`** → redirect similarly.

Always verify **current Supabase docs** for MCP / OAuth client settings: redirect URIs, authorize URL, and client IDs must match **your** deployment base URL.

---

## 6. Client configuration (Claude Desktop / Cursor)

Use **stateless HTTP** and the **full MCP endpoint URL** (including the final **`mcp`** segment if that is your route):

```json
{
  "mcpServers": {
    "your_app": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://YOUR_PUBLIC_ORIGIN/api/mcp/mcp",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

Replace `YOUR_PUBLIC_ORIGIN` with localhost tunnel URL during dev (see below).

---

## Local development

Until you deploy:

1. **MCP clients run on your machine** but call **a URL they can reach**. Plain `http://localhost:3000` works only if the client can use that host; some setups need **HTTPS** or a tunnel (**ngrok**, **Cloudflare Tunnel**, etc.).
2. Register the **tunnel URL** (or `http://127.0.0.1:PORT`) in **Supabase Auth** redirect / site URL settings as required for OAuth.
3. **`resource_metadata`** and **`WWW-Authenticate`** must use a base URL the **client** can fetch — use the same origin you put in `mcp-remote`.
4. After you choose hosting (**Vercel**, **Fly**, etc.), revisit: cold starts, timeouts, and a single **canonical** `https://` origin for OAuth.

---

## Pitfall checklist (saves iteration)

| Symptom / mistake | Fix |
|-------------------|-----|
| 401 forever, no OAuth prompt | Add **`WWW-Authenticate`** with **`resource_metadata`** pointing to **`/.well-known/oauth-protected-resource`**. |
| Wrong path / 404 | Document **`/api/mcp/mcp`** (or your chosen path) consistently; match App Router file structure. |
| Works in browser, fails from MCP | MCP uses **Bearer**, not cookies — validate **JWT** in `Authorization`. |
| GET to MCP URL | **`http-only`** uses **POST**; 405 on GET is OK if message is clear. |
| Huge bundle or build errors in MCP route | Keep **tool schemas as plain JSON**; avoid heavy validators in the route file. |
| Tool throws → client breaks | Return **`isError`** MCP result for **`tools/call`** where appropriate. |
| Batch / notifications | Support **array** body; **filter out** `null` responses for notifications; **204** for single notification. |
| CORS on metadata | Use **`metadataCorsOptionsRequestHandler`** from **`mcp-handler`** if browsers or tools preflight the metadata URL. |

---

## Minimal file checklist

- [ ] `app/.well-known/oauth-protected-resource/route.ts` — `mcp-handler` `protectedResourceHandler`
- [ ] `app/api/mcp/.../route.ts` — `POST` JSON-RPC + optional `GET` 405
- [ ] `lib/mcp/auth.ts` — Bearer + `getUser`
- [ ] `lib/mcp/tools.ts` — read-only tool dispatch
- [ ] `app/authorize/page.tsx` — `authorization_id` + `oauth.*` approve/deny
- [ ] Supabase Dashboard — MCP/OAuth client URLs aligned with your origin
- [ ] User-facing docs — copy-paste `mcp-remote` command with exact URL

---

## Reference implementation (optional)

If you have access to the **kitchen-inventory** repository, concrete filenames to compare:

- `app/api/mcp/[transport]/route.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/tools.ts`
- `app/.well-known/oauth-protected-resource/route.ts`
- `app/authorize/page.tsx`

---

*Last updated for greenfield use: Supabase JWT, read-only tools, hosting TBD.*
