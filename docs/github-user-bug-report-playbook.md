# User bug reports → GitHub issues — implementation playbook

Portable instructions for adding **in-app “report a bug”** that **creates a real GitHub issue** via the **REST API**, from a **Next.js (App Router)** app. No dependency on this repository’s domain logic.

Use this with **Claude Code** on a greenfield app: implement the pieces below, then resolve the **open questions** at the end with the product owner.

---

## What we built (reference behavior)

1. **Client:** A dialog collects a **free-text description**. On submit, the client sends **JSON** to a **server-only API route** with:
   - `description` (required)
   - `pageUrl` (current `window.location.href`)
   - `userAgent`
   - `consoleLogs` (optional string, from a small in-memory ring buffer)
   - `userId` / `userEmail` (best-effort from your auth client, e.g. Supabase `getUser()` — omit or null if anonymous)
2. **Server:** Validates input, reads **secrets from env**, calls **`POST https://api.github.com/repos/{owner}/{repo}/issues`** with `Authorization: Bearer`, builds a **Markdown** issue body (sections + optional `<details>` for logs), sets **labels**.
3. **Response:** JSON `{ success: true, issueNumber }` on success; generic error messages to the client on failure (do not leak token or raw GitHub errors to end users).

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GITHUB_TOKEN` | **Yes** | PAT or fine-grained token with permission to **create issues** in the target repo. **Server-only** — never `NEXT_PUBLIC_*`. |
| `GITHUB_REPO_OWNER` | Optional | GitHub org or user (default in reference: project-specific; **override per app**). |
| `GITHUB_REPO_NAME` | Optional | Repository name (same as above). |

**Deployment:** Set these in Vercel/hosting secrets, not in client bundles.

---

## GitHub setup (do this before shipping)

1. **Create a token**
   - **Classic PAT:** scope **`repo`** for private repos, or **`public_repo`** if the repo is public and that scope is enough for issues.
   - **Fine-grained PAT:** grant **Issues** = Read and write on the target repository.
2. **Labels:** The reference API sends `labels: ["bug", "user-reported"]`. GitHub’s **Create an issue** API requires **labels to already exist** on the repository (or the request can fail). Either:
   - Create those labels in the repo UI, **or**
   - Change the code to use labels you already use, **or**
   - Omit `labels` from the payload if you do not need automation (trade-off: harder triage).
3. **Security / abuse:** The route is **unauthenticated** in the reference app (anyone who can hit the URL can create issues). For production, consider:
   - **Rate limiting** (per IP / per user id),
   - Optional **auth requirement** (session or API key) before accepting reports,
   - **CAPTCHA** or similar if you see spam.

Clarify with the team how open the endpoint should be.

---

## API route: `POST /api/bug-report`

**Suggested path:** `app/api/bug-report/route.ts`

**Request body (JSON):**

```json
{
  "description": "string (required)",
  "pageUrl": "string | optional",
  "userAgent": "string | optional",
  "consoleLogs": "string | optional",
  "userId": "string | null | optional",
  "userEmail": "string | null | optional"
}
```

**Validation:**

- If `description` is missing or not a non-empty string → **400** `{ "error": "Description is required" }`.
- If `GITHUB_TOKEN` is missing → **500** `{ "error": "Bug reporting is not configured" }` (log server-side; don’t expose config details).

**GitHub call:**

- URL: `https://api.github.com/repos/${owner}/${repo}/issues`
- Headers:
  - `Authorization: Bearer ${GITHUB_TOKEN}`
  - `Accept: application/vnd.github+json`
  - `Content-Type: application/json`
- Body:
  - `title`: short prefix + truncated description, e.g. `[Bug] ${description.slice(0, 80)}…`
  - `body`: Markdown assembled from description, page URL, user agent, ISO timestamp, reporter id/email, optional collapsed console logs.
  - `labels`: as agreed in repo setup.

**Console log length:** Truncate server-side (reference: **5000** characters) so the issue body stays within GitHub limits and avoids huge payloads.

**Errors:** If GitHub returns non-OK → **502** `{ "error": "Failed to create GitHub issue" }` and log response text server-side.

---

## Issue body template (reference structure)

Use Markdown for readability in GitHub:

- Heading: `## Bug Report`
- **Description** (user text, unchanged)
- **Page URL**, **User Agent**, **Reported at** (ISO)
- **Reporter:** bullet list with user id and email (or “not authenticated” / “not available”)
- If `consoleLogs` present: HTML `<details><summary>Console Logs</summary>` + fenced code block

This keeps PII (email) **inside the private repo**; still confirm **privacy policy** and whether email should be included for the new app.

---

## Client UI: bug report dialog

**Suggested component:** `components/bug-report-dialog.tsx` (client component).

- State: `description`, `isSubmitting`.
- On submit:
  1. `formatLogsForReport()` from your console capture helper (see below).
  2. `pageUrl` / `userAgent` from `window` / `navigator`.
  3. Best-effort auth: e.g. `supabase.auth.getUser()` — wrap in try/catch; failure is non-fatal.
  4. `fetch("/api/bug-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...}) })`.
  5. On success: toast, clear field, close dialog; on failure: destructive toast with message from JSON `error` if present.

Match your design system (reference uses shadcn `Dialog`, `Textarea`, `Button`, `toast`, optional haptics).

---

## Console log capture (optional but recommended)

**Suggested module:** `lib/console-capture.ts`

- **Ring buffer** (reference: **50** entries): each entry has `level` (`log` | `warn` | `error`), `message`, `timestamp`.
- **`installConsoleCapture()`:** Once per app load in the browser, wrap `console.log` / `console.warn` / `console.error` to push to the buffer and then call the original method. Guard with `typeof window !== "undefined"` and a boolean so you only install once.
- **`formatLogsForReport()`:** Join entries as lines like `[ISO] [LEVEL] message`.

**Wire-up:** Call `installConsoleCapture()` from a client **`useEffect`** in your root providers (reference: `app/providers.tsx`), not during SSR.

**Limitations:** Only captures logs **after** install; does not capture network tab or crashes before JS runs. Good enough for many UI bugs.

---

## Optional UX: nudges to open the dialog

These are **not** required for GitHub integration; they improve discovery.

1. **`useBugReportNudge` hook** — Wraps your toast helper: for **`variant === "destructive"`** toasts, append a **“Report Bug”** action that sets local state to open `BugReportDialog`. The parent must render `<BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />`.
2. **`ScreenshotBugNudge`** — Listens for screenshot shortcuts (e.g. macOS `⌘⇧3/4/5`, `PrintScreen`), shows a short-delay toast with **Report Bug** that opens the same dialog.
3. **Settings / help** — A visible “Report a bug” entry that opens the dialog (reference: profile card).

---

## Wiring checklist

- [ ] `GITHUB_TOKEN` (+ owner/name) in hosting env
- [ ] Labels exist in GitHub or code updated
- [ ] `app/api/bug-report/route.ts` — POST handler + GitHub fetch
- [ ] `lib/console-capture.ts` + `installConsoleCapture` in root providers
- [ ] `BugReportDialog` + at least one entry point (settings and/or nudges)
- [ ] Privacy copy in the dialog (“URL, browser, logs, account info may be sent”)

---

## Reference file map (kitchen-inventory)

If you have this repo for comparison:

| Piece | Path |
|-------|------|
| API route | `app/api/bug-report/route.ts` |
| Dialog | `components/bug-report-dialog.tsx` |
| Console capture | `lib/console-capture.ts` |
| Install capture | `app/providers.tsx` (`useEffect` → `installConsoleCapture`) |
| Toast nudge | `hooks/use-bug-report-nudge.tsx` |
| Screenshot nudge | `components/screenshot-bug-nudge.tsx` |
| Usage | `profile-settings.tsx`, `inventory-dashboard.tsx`, `add-item-form.tsx`, etc. |

---

## Questions for Claude Code to ask the user (before or while implementing)

1. **Repository:** Exact `owner/name` for the new app’s GitHub repo?
2. **Token:** Who creates the PAT / fine-grained token, and where will it live (Vercel env name, rotation policy)?
3. **Labels:** Use `bug` + `user-reported`, different names, or no labels?
4. **Privacy:** Include **email** and **user id** in the issue body, or anonymize / drop for GDPR or internal policy?
5. **Abuse:** Should the route stay **public**, or require **signed-in** users only, **rate limits**, or **CAPTCHA**?
6. **Auth stack:** Still Supabase (or something else) for `getUser()` on the client?
7. **Product copy:** “Bug” vs “Feedback” vs “Report an issue” — same GitHub flow or separate labels/repo?
8. **Success UX:** Show **issue number** or link to GitHub in the toast (needs `html_url` from API response), or keep a generic thank-you?

---

*Portable playbook: user-submitted text → server → GitHub Issues API.*
