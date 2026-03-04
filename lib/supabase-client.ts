"use client"

import { createBrowserClient } from "@supabase/ssr"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function missingEnvError() {
  return new Error("Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
}

function createFallbackClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: missingEnvError() }),
      getUser: async () => ({ data: { user: null }, error: missingEnvError() }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithOtp: async () => ({ data: null, error: missingEnvError() }),
      signInWithOAuth: async () => ({ data: null, error: missingEnvError() }),
      signOut: async () => ({ error: missingEnvError() }),
    },
  }
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (createFallbackClient() as any)
