'use client'

import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: Theme
  enableSystem?: boolean
  storageKey?: string
  disableTransitionOnChange?: boolean
}

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
})

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = 'theme',
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light')

  // Pick up any stored preference once we're on the client. The inline script
  // in app/layout.tsx has already applied the correct class before paint; this
  // just syncs React state to it.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored)
      }
    } catch {
      // localStorage may be unavailable (private mode / SSR) — fall back to default.
    }
  }, [storageKey])

  // Apply the resolved theme to <html> and follow OS changes while on "system".
  React.useEffect(() => {
    const root = document.documentElement

    const apply = () => {
      const resolved =
        theme === 'system' && enableSystem ? systemTheme() : theme === 'dark' ? 'dark' : 'light'

      // Suppress the global color transitions during the swap so it doesn't
      // animate every token at once (respected by next-themes too).
      let killer: HTMLStyleElement | undefined
      if (disableTransitionOnChange) {
        killer = document.createElement('style')
        killer.appendChild(document.createTextNode('*,*::before,*::after{transition:none !important}'))
        document.head.appendChild(killer)
      }

      root.classList.toggle('dark', resolved === 'dark')
      setResolvedTheme(resolved)

      if (killer) {
        // Force a reflow, then drop the override on the next frame.
        window.getComputedStyle(document.body).opacity
        requestAnimationFrame(() => killer && document.head.removeChild(killer))
      }
    }

    apply()

    if (theme === 'system' && enableSystem) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme, enableSystem, disableTransitionOnChange])

  const setTheme = React.useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // ignore — state still updates in-memory for this session
      }
      setThemeState(next)
    },
    [storageKey],
  )

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
