type LogLevel = "log" | "warn" | "error"

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
}

const MAX_ENTRIES = 50
const buffer: LogEntry[] = []
let installed = false

function pushEntry(level: LogLevel, args: unknown[]) {
  const message = args
    .map((a) => {
      if (typeof a === "string") return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(" ")

  buffer.push({ level, message, timestamp: new Date().toISOString() })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
}

export function installConsoleCapture() {
  if (installed || typeof window === "undefined") return

  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    pushEntry("log", args)
    origLog(...args)
  }
  console.warn = (...args: unknown[]) => {
    pushEntry("warn", args)
    origWarn(...args)
  }
  console.error = (...args: unknown[]) => {
    pushEntry("error", args)
    origError(...args)
  }

  installed = true
}

export function getRecentLogs(): LogEntry[] {
  return [...buffer]
}

export function formatLogsForReport(): string {
  return buffer
    .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
    .join("\n")
}
