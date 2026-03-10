"use client"

import { useState, useRef, useCallback, useEffect } from "react"

type SpeechState = "idle" | "listening" | "error"

interface UseSpeechRecognitionOptions {
  lang?: string
  /** Auto-stop after this many ms of silence (default 3000) */
  silenceTimeout?: number
  /** Hard cap in ms (default 30000) */
  maxDuration?: number
}

interface UseSpeechRecognitionReturn {
  supported: boolean
  state: SpeechState
  transcript: string
  interimTranscript: string
  error: string | null
  start: () => void
  stop: () => void
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = "en-IN", silenceTimeout = 3000, maxDuration = 30000 } = options

  const [supported] = useState(() => {
    if (typeof window === "undefined") return false
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  })

  const [state, setState] = useState<SpeechState>("idle")
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadErrorRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    silenceTimerRef.current = null
    maxTimerRef.current = null
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    recognitionRef.current?.stop()
  }, [clearTimers])

  const start = useCallback(() => {
    if (!supported) {
      setError("Speech recognition is not supported in this browser.")
      return
    }

    setTranscript("")
    setInterimTranscript("")
    setError(null)
    setState("listening")
    hadErrorRef.current = false

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.")
      setState("error")
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    let finalParts: string[] = []

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Start (or reset) the silence timer only after first speech is detected.
      // This gives the user unlimited time to begin speaking.
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
      }, silenceTimeout)

      let interim = ""
      finalParts = []

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalParts.push(result[0].transcript)
        } else {
          interim += result[0].transcript
        }
      }

      const finalText = finalParts.join(" ").trim()
      setTranscript(finalText)
      setInterimTranscript(interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearTimers()
      if (event.error === "no-speech") {
        setError("No speech detected. Please try again.")
      } else if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.")
      } else if (event.error === "aborted") {
        // User-initiated stop, not an error
        return
      } else {
        setError(`Speech error: ${event.error}`)
      }
      setState("error")
      hadErrorRef.current = true
    }

    recognition.onend = () => {
      clearTimers()
      const final = finalParts.join(" ").trim()
      if (final) setTranscript(final)
      setInterimTranscript("")
      if (!hadErrorRef.current) setState("idle")
    }

    // Hard cap timer — only this fires at start. Silence timer starts on first result.
    maxTimerRef.current = setTimeout(() => {
      recognition.stop()
    }, maxDuration)

    recognition.start()
  }, [supported, lang, silenceTimeout, maxDuration, clearTimers])

  useEffect(() => {
    return () => {
      clearTimers()
      recognitionRef.current?.abort()
    }
  }, [clearTimers])

  return { supported, state, transcript, interimTranscript, error, start, stop }
}
