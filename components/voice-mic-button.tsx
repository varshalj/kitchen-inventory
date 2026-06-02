"use client"

/**
 * Voice mic button — Slice 3 Stage 1 (per ADR 010).
 *
 * Three visual states driven by the useVoiceSession hook:
 *
 *   1. Idle  → floating circular button bottom-right. Tap to connect.
 *   2. Active → compact strip at the bottom showing status + last turn.
 *               Tap expand chevron to see the full transcript above.
 *   3. Error → floating button with error icon; tap to retry.
 *
 * Visibility:
 *   This component renders unconditionally — the parent (layout) is
 *   responsible for gating whether it appears (e.g. only for users with
 *   feature_grants.voice_agent_enabled, and hidden when an overlay is
 *   open). That gating is the next sub-step of Stage 1.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Mic,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  useVoiceSession,
  type VoiceServerMessage,
  type VoiceStatus,
  type VoiceTurn,
} from "@/hooks/use-voice-session"
import { useOverlayActive } from "@/hooks/use-overlay-active"
import { useReview } from "@/contexts/review-context"

// Paths where the mic button should NOT appear. These are non-main pages
// (auth, marketing, focused-task page routes that aren't modals). Avoids
// the situation where voice tries to interact with a focused setup flow.
//
// Doubles as a nav blocklist used by handleServerMessage below — if the
// voice agent ever emits navigate_to with one of these paths, we drop it.
// `/` belongs here for the nav case (the landing page bounces signed-in
// users awkwardly through /auth → /dashboard); on the auth-less landing
// the mic doesn't render anyway via VoiceMicGated, so adding `/` doesn't
// affect the hide-on-page behavior.
const HIDDEN_PATHS = new Set([
  "/",
  "/add-item",
  "/auth",
  "/authorize",
  "/landing-preview",
  "/privacy",
  "/terms",
])

// Pre-warm Pipecat SDK chunks during browser idle time so the first
// connect tap doesn't pay the entire dynamic-import cost. Falls back to
// a deferred setTimeout when requestIdleCallback isn't available
// (Safari < 17, etc.). Safe to call multiple times — browsers dedupe
// fetches for the same dynamic import.
let _pipecatPreloadStarted = false
function preloadPipecatSdk() {
  if (_pipecatPreloadStarted) return
  _pipecatPreloadStarted = true
  const start = () => {
    Promise.all([
      import("@pipecat-ai/client-js"),
      import("@pipecat-ai/websocket-transport"),
    ]).catch(() => {
      // Network hiccup — let the real connect retry surface the error.
      _pipecatPreloadStarted = false
    })
  }
  if (typeof window === "undefined") return
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
  }
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(start, { timeout: 4000 })
  } else {
    setTimeout(start, 1200)
  }
}

export function VoiceMicButton() {
  const router = useRouter()
  const { toast } = useToast()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Stable string for effect deps — URLSearchParams identity churns on
  // every render in app-router. toString() gives a deterministic key.
  const searchParamsKey = searchParams?.toString() ?? ""

  // Slice 3 Stage 3: handle RTVI server-messages emitted by the agent.
  // The agent calls `navigate_to(path)` or auto-emits `toast` after a
  // successful write; both come down this single channel. Branch on
  // `msg.type`. Keep handlers idempotent + cheap — they fire from the
  // Pipecat client's onServerMessage hook, possibly during render.
  //
  // Defense in depth: even though the server rejects HIDDEN_PATHS,
  // re-validate here in case the agent sends something stale or the
  // path list drifts.
  const handleServerMessage = useCallback(
    (msg: VoiceServerMessage) => {
      if (msg.type === "navigate_to") {
        const data = (msg.data ?? {}) as { path?: unknown }
        const target = typeof data.path === "string" ? data.path.trim() : ""
        if (!target || !target.startsWith("/")) return
        if (HIDDEN_PATHS.has(target)) return
        // Skip a no-op push to avoid an unnecessary re-render + a stale
        // page_context echo on the server side.
        if (target === pathname) return
        router.push(target)
      } else if (msg.type === "toast") {
        const data = (msg.data ?? {}) as {
          kind?: string
          title?: string
          description?: string
        }
        if (!data.title && !data.description) return
        toast({
          title: data.title,
          description: data.description,
          variant: data.kind === "error" ? "destructive" : undefined,
        })
      } else if (msg.type === "apply_filter") {
        // Slice 3 Stage 4: agent set one URL search-param on the
        // current page (e.g. ?filter=expiring-soon). Read current path
        // + query string FRESH from window.location rather than the
        // closure-captured `pathname` / `searchParams`. This reduces
        // the race window when the agent chains navigate_to + apply_filter
        // back-to-back — the closure's pathname may not have caught up
        // to the in-flight router.push, but window.location.pathname is
        // closer to the truth in most cases. Fall back to closure
        // pathname for SSR safety only.
        const data = (msg.data ?? {}) as { name?: unknown; value?: unknown }
        const name = typeof data.name === "string" ? data.name.trim() : ""
        const value = typeof data.value === "string" ? data.value.trim() : ""
        if (!name || !value) return
        const currentPath =
          typeof window !== "undefined" ? window.location.pathname : pathname
        const params = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : "",
        )
        params.set(name, value)
        const qs = params.toString()
        router.push(qs ? `${currentPath}?${qs}` : currentPath)
      } else if (msg.type === "clear_filters") {
        // Strip all URL search-params on the current page. Page reverts
        // to its default filters / sort. If the page used no search
        // params anyway, this is a cheap no-op.
        const currentPath =
          typeof window !== "undefined" ? window.location.pathname : pathname
        router.push(currentPath)
      }
      // Unknown message types are ignored — forward-compatible for
      // future stages.
    },
    [router, toast, pathname],
  )

  const { status, transcript, error, connect, disconnect, sendClientMessage } =
    useVoiceSession({ onServerMessage: handleServerMessage })
  const [expanded, setExpanded] = useState(false)
  const overlayActive = useOverlayActive()
  const { chipVisible } = useReview()

  // Pre-warm the Pipecat SDK chunks on mount so the first connect tap
  // doesn't pay the full dynamic-import latency (~500ms-1s on cold cache).
  useEffect(() => {
    preloadPipecatSdk()
  }, [])

  // Auto-collapse the transcript whenever the session ends so re-connecting
  // starts in the clean compact state.
  useEffect(() => {
    if (status === "idle" || status === "error") setExpanded(false)
  }, [status])

  // Policy A from ADR 010: auto-disconnect the voice session when any
  // sheet/dialog opens. Sheets are focused UI tasks — voice running in
  // background would capture typing audio and the strip overlaps the
  // sheet anyway. Cleaner intent: voice pauses, user resumes after.
  // Trade-off: a pending dry-run preview is lost. Acceptable for now;
  // Policy D (smart pause/resume) is in LEARNINGS.md backlog.
  const isSessionAlive =
    status === "connecting" || status === "connected" || status === "speaking"
  useEffect(() => {
    if (overlayActive && isSessionAlive) {
      disconnect()
      toast({
        title: "Voice paused",
        description: "Resume by tapping the mic after you close this.",
      })
    }
  }, [overlayActive, isSessionAlive, disconnect, toast])

  // Slice 3 Stage 2: push the user's current page context into the
  // voice session so the agent can answer "what page am I on?" and
  // ground references like "this list" / "this item". We send:
  //   - once when the session becomes ready (status flips to "speaking"
  //     for the greeting or "connected" thereafter)
  //   - again on any pathname / search-params change while the session
  //     is alive (route navigation, filter changes, etc.)
  //
  // We deliberately skip "connecting" — the RTVI client only allows
  // sendClientMessage after handshake (transportReady), which the hook
  // tracks via clientReadyRef. Status reaching "speaking"/"connected"
  // guarantees the handshake has completed. The hook also silently
  // drops sends before ready, so calls during status churn are safe.
  const sessionReady = status === "connected" || status === "speaking"
  useEffect(() => {
    if (!sessionReady) return
    const params: Record<string, string> = {}
    if (searchParams) {
      for (const [k, v] of searchParams.entries()) params[k] = v
    }
    sendClientMessage("page_context", {
      path: pathname || "/",
      search_params: params,
    })
    // searchParamsKey is the stable string surrogate for the
    // URLSearchParams object whose identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParamsKey, sessionReady, sendClientMessage])

  // Hide on non-main pages (auth flow, /add-item, marketing pages, etc.)
  // and whenever an overlay or the review chip is visible. Each of these
  // is a "focused task" surface that voice should yield to.
  if (pathname && HIDDEN_PATHS.has(pathname)) return null
  if (overlayActive) return null
  if (chipVisible) return null

  // Idle: just the floating mic button.
  if (status === "idle") {
    return (
      <FloatingButton
        aria-label="Start voice assistant"
        variant="primary"
        onClick={connect}
      >
        <Mic className="h-6 w-6" />
      </FloatingButton>
    )
  }

  // Error: red floating button; tap to retry.
  if (status === "error") {
    return (
      <FloatingButton
        aria-label={`Voice error: ${error || "unknown"} — tap to retry`}
        variant="destructive"
        onClick={connect}
        title={error || "Voice error"}
      >
        <AlertCircle className="h-6 w-6" />
      </FloatingButton>
    )
  }

  // Active states (connecting / connected / speaking): strip + optional expand.
  const lastTurn = transcript[transcript.length - 1]

  return (
    <>
      {expanded && transcript.length > 0 && (
        <TranscriptPanel transcript={transcript} />
      )}

      <div
        className={cn(
          "fixed bottom-20 right-4 left-4 z-40",
          "mx-auto max-w-2xl",
          "h-14 rounded-full",
          "bg-background border shadow-lg",
          "flex items-center gap-3 px-4",
        )}
        role="region"
        aria-label="Voice assistant session"
      >
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0 text-sm truncate">
          <StatusText status={status} lastTurn={lastTurn} />
        </div>
        {transcript.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse transcript" : "Expand transcript"}
            className="p-1.5 rounded hover:bg-muted transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={disconnect}
          aria-label="End voice session"
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface FloatingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "primary" | "destructive"
  children: React.ReactNode
}

function FloatingButton({
  variant,
  children,
  className,
  ...rest
}: FloatingButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "fixed bottom-20 right-4 z-40",
        "h-14 w-14 rounded-full shadow-lg",
        "flex items-center justify-center",
        "hover:scale-105 transition-transform",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "destructive" &&
          "bg-destructive text-destructive-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function StatusIcon({ status }: { status: VoiceStatus }) {
  if (status === "connecting") {
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />
  }
  if (status === "speaking") {
    // Active speech — mic pulses to signal "I'm talking now"
    return <Mic className="h-5 w-5 text-primary animate-pulse" />
  }
  // connected (listening) — calm mic
  return <Mic className="h-5 w-5 text-primary" />
}

function StatusText({
  status,
  lastTurn,
}: {
  status: VoiceStatus
  lastTurn: VoiceTurn | undefined
}) {
  if (status === "connecting") {
    return <span className="text-muted-foreground">Connecting…</span>
  }
  if (status === "speaking") {
    return (
      <>
        <span className="font-semibold mr-1.5">Kitchen Mate:</span>
        <span>
          {lastTurn?.role === "agent" ? lastTurn.text : "Speaking…"}
        </span>
      </>
    )
  }
  // connected (listening) — show last turn if any, else prompt
  if (!lastTurn) {
    return <span className="text-muted-foreground">Listening…</span>
  }
  return (
    <span className="text-muted-foreground">
      <span className="font-medium">
        {lastTurn.role === "user" ? "You: " : "Kitchen Mate: "}
      </span>
      {lastTurn.text}
    </span>
  )
}

function TranscriptPanel({ transcript }: { transcript: VoiceTurn[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new turns so the latest message is visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [transcript.length])

  return (
    <div
      ref={scrollRef}
      className={cn(
        "fixed bottom-36 right-4 left-4 z-30",
        "mx-auto max-w-2xl",
        "max-h-96 overflow-y-auto",
        "rounded-lg bg-background border shadow-lg p-3",
      )}
      role="log"
      aria-live="polite"
      aria-label="Voice conversation transcript"
    >
      <ul className="space-y-1.5 text-sm">
        {transcript.map((turn) => (
          <li
            key={turn.id}
            className={cn(
              "p-2 rounded",
              turn.role === "user" ? "bg-muted/40" : "bg-primary/10",
            )}
          >
            <span className="font-semibold text-xs uppercase mr-1.5 opacity-70">
              {turn.role === "user" ? "You" : "Kitchen Mate"}
            </span>
            <span>{turn.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
