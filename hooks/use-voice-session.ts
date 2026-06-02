"use client"

/**
 * Voice session hook — wraps the Pipecat JS client lifecycle.
 *
 * Manages connecting to the Modal-deployed voice agent, streaming audio
 * to/from the browser mic + speakers, and surfacing turn-by-turn transcript
 * + status to whatever UI consumes it.
 *
 * Auth: reuses the user's existing Supabase session JWT — no manual paste
 * (per ADR 010 B1). Same security boundary as the rest of the app.
 *
 * SSR: the Pipecat client uses browser-only APIs (WebSocket, MediaDevices,
 * AudioContext). The SDK is dynamically imported inside connect() so it
 * never runs server-side. The component using this hook should also be
 * marked "use client".
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase-client"

const DEFAULT_VOICE_URL =
  "wss://varshaljain--kitchen-inventory-voice-fastapi-app.modal.run/ws"

function voiceAgentUrl(): string {
  // Env override is supported so we can point at staging / local Modal
  // serves without code changes. Falls back to the deployed production URL.
  return (
    process.env.NEXT_PUBLIC_VOICE_AGENT_URL ||
    DEFAULT_VOICE_URL
  )
}

export type VoiceStatus =
  | "idle" // not connected, button shown
  | "connecting" // calling connect(), Pipecat handshaking, OR mid-greeting
  | "connected" // session live, agent listening for user input
  | "speaking" // agent is talking back
  | "error" // failed; button shows retry affordance

// Note on `connecting`: this status now covers BOTH the actual WebSocket /
// Pipecat handshake AND the post-handshake window before the agent
// finishes its session-start greeting. Until the greeting completes, the
// agent isn't really listening to the user — labeling that window as
// "connected"/"listening" was misleading. We flip to "connected" only
// after the first onBotStoppedSpeaking fires.

export interface VoiceTurn {
  id: string
  role: "user" | "agent"
  text: string
  timestamp: Date
}

export interface UseVoiceSessionReturn {
  status: VoiceStatus
  transcript: VoiceTurn[]
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /**
   * Fire-and-forget custom message to the voice agent (RTVI
   * `sendClientMessage`). Used to push browser-side context — currently
   * the page the user is viewing — so the agent can answer "where am I?"
   * and ground "this list" / "this item" references.
   *
   * Silently no-ops if the client isn't ready yet (pre-handshake) or has
   * been disconnected. Callers don't need to gate on `status`; the hook
   * tracks readiness internally via a ref set in `onConnected`.
   */
  sendClientMessage: (type: string, data?: unknown) => void
}

function generateTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [transcript, setTranscript] = useState<VoiceTurn[]>([])
  const [error, setError] = useState<string | null>(null)

  // Ref to the live Pipecat client so disconnect() can reach it; refs
  // (not state) because we don't want re-renders when the client changes
  // and stale closures inside callbacks would otherwise hold the wrong one.
  const clientRef = useRef<unknown>(null)
  // Track mount status so we can suppress state updates after unmount
  // (Pipecat callbacks can fire during teardown).
  const mountedRef = useRef(true)
  // Tracks whether the session's start-up greeting has finished. Used to
  // hold the status at "connecting" through the greeting so we don't
  // briefly flash "Listening" before the agent has stopped speaking.
  const greetingDoneRef = useRef(false)
  // Tracks whether the Pipecat client has completed its handshake and is
  // ready to receive `sendClientMessage` calls. RTVI's sendClientMessage
  // is gated by an internal `transportReady` decorator — calling it
  // before the client reaches that state is dropped/rejected. We flip
  // this in `onConnected` (after the WS + RTVI handshake) and reset in
  // `onDisconnected`. The `sendClientMessage` wrapper below checks this
  // ref so callers don't have to gate on status themselves.
  const clientReadyRef = useRef(false)

  const safeSetStatus = useCallback((next: VoiceStatus) => {
    if (mountedRef.current) setStatus(next)
  }, [])

  const appendTurn = useCallback(
    (role: VoiceTurn["role"], text: string) => {
      if (!mountedRef.current || !text) return
      setTranscript((prev) => [
        ...prev,
        { id: generateTurnId(), role, text, timestamp: new Date() },
      ])
    },
    [],
  )

  const connect = useCallback(async () => {
    // Guard against double-connects
    if (
      status === "connecting" ||
      status === "connected" ||
      status === "speaking"
    ) {
      return
    }

    safeSetStatus("connecting")
    setError(null)
    setTranscript([])
    greetingDoneRef.current = false
    clientReadyRef.current = false

    try {
      // 1. Get user JWT from existing Supabase session — no manual paste.
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`)
      }
      if (!data?.session?.access_token) {
        throw new Error(
          "Not signed in — please sign in before using voice.",
        )
      }
      const token = data.session.access_token

      // 2. Lazy-load Pipecat SDK so SSR never touches browser-only APIs.
      const [PipecatCore, PipecatWS] = await Promise.all([
        import("@pipecat-ai/client-js"),
        import("@pipecat-ai/websocket-transport"),
      ])
      const PipecatClient =
        (PipecatCore as { PipecatClient: new (opts: unknown) => unknown })
          .PipecatClient
      const WebSocketTransport =
        (PipecatWS as { WebSocketTransport: new (opts: unknown) => unknown })
          .WebSocketTransport

      // 3. Build WebSocket URL with token query param.
      const wsUrl = `${voiceAgentUrl()}?token=${encodeURIComponent(token)}`

      // 4. Wire up transport + client + callbacks.
      const transport = new WebSocketTransport({
        wsUrl,
        sampleRate: 16000,
      })

      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            // Stay at "connecting" — the agent is about to start its
            // greeting, not yet listening. We'll flip to "connected"
            // only after the first onBotStoppedSpeaking fires (greeting
            // finished, now actually listening for user input).
            //
            // Mark the client ready so sendClientMessage() calls
            // (page_context updates) can flow through. RTVI gates
            // sendClientMessage on internal transportReady — this
            // callback fires after handshake, so it's safe from here.
            clientReadyRef.current = true
          },
          onDisconnected: () => {
            if (mountedRef.current) {
              setStatus("idle")
            }
            clientRef.current = null
            greetingDoneRef.current = false
            clientReadyRef.current = false
          },
          onError: (err: unknown) => {
            if (!mountedRef.current) return
            const msg =
              (err as { message?: string })?.message ||
              (typeof err === "string" ? err : JSON.stringify(err))
            setError(msg)
            setStatus("error")
          },
          onUserTranscript: (data: {
            text?: string
            final?: boolean
          }) => {
            // Only log final transcripts — partial transcripts would
            // produce duplicate noisy turns.
            if (data?.final && data.text) {
              appendTurn("user", data.text)
            }
          },
          onBotTranscript: (data: { text?: string }) => {
            if (data?.text) {
              appendTurn("agent", data.text)
            }
          },
          onBotStartedSpeaking: () => {
            safeSetStatus("speaking")
          },
          onBotStoppedSpeaking: () => {
            // First time: greeting just finished — now we're truly listening.
            // Subsequent times: agent finished a reply, back to listening.
            // Either way, "connected" = "ready for user input" now.
            greetingDoneRef.current = true
            safeSetStatus("connected")
          },
        },
      }) as { connect: () => Promise<void>; disconnect: () => Promise<void> }

      clientRef.current = client
      await client.connect()
    } catch (e: unknown) {
      if (!mountedRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus("error")
      clientRef.current = null
    }
  }, [status, appendTurn, safeSetStatus])

  const sendClientMessage = useCallback(
    (type: string, data?: unknown) => {
      // Silently no-op when no client or before handshake completes —
      // callers (e.g. the page_context effect in voice-mic-button) can
      // call this eagerly without gating on status. Per Pipecat JS
      // client source, sendClientMessage is fire-and-forget at the
      // RTVI layer (wraps as RTVIMessage(CLIENT_MESSAGE, {t, d})).
      const client = clientRef.current as
        | { sendClientMessage?: (type: string, data?: unknown) => void }
        | null
      if (!client?.sendClientMessage) return
      if (!clientReadyRef.current) return
      try {
        client.sendClientMessage(type, data)
      } catch {
        // Best-effort. A failed send (e.g. transport tore down between
        // the ready check and the call) shouldn't crash the consumer.
      }
    },
    [],
  )

  const disconnect = useCallback(async () => {
    const client = clientRef.current as {
      disconnect?: () => Promise<void>
    } | null
    if (!client?.disconnect) {
      safeSetStatus("idle")
      return
    }
    try {
      await client.disconnect()
    } catch {
      // Swallow disconnect-time errors — the session is ending anyway.
    }
    clientRef.current = null
    safeSetStatus("idle")
  }, [safeSetStatus])

  // Cleanup on unmount — important if the user navigates away mid-session.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const client = clientRef.current as {
        disconnect?: () => Promise<void>
      } | null
      if (client?.disconnect) {
        client.disconnect().catch(() => {
          /* ignore */
        })
        clientRef.current = null
      }
    }
  }, [])

  return { status, transcript, error, connect, disconnect, sendClientMessage }
}
