import OpenAI from "openai"

/**
 * LLM client factory — provider-agnostic, OpenAI-wire-compatible.
 *
 * Both OpenRouter and OpenAI speak the same Chat Completions API, so switching
 * providers is a `baseURL` + key swap, never an SDK rewrite. This module is the
 * single place that decision lives; every AI route calls `getLLM(...)` instead
 * of `new OpenAI(...)`.
 *
 * Provider selection (first match wins):
 *   1. OPENROUTER_API_KEY → route through OpenRouter (recommended)
 *   2. OPENAI_API_KEY     → legacy direct-to-OpenAI path (backward compatible)
 *
 * Model choice is env-driven per route (see the `LLM_MODEL_*` vars in
 * .env.example) so you can move any route between free and paid models — or add
 * a paid fallback — from the hosting dashboard with no code change or redeploy.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

/**
 * Default model for every route. Namespaced for OpenRouter; the "openai/"
 * prefix is stripped automatically on the direct-OpenAI path. Keeping this equal
 * to the pre-migration model means the switch is behaviourally a no-op until you
 * deliberately point a route elsewhere.
 */
export const DEFAULT_LLM_MODEL = "openai/gpt-4o-mini"

export interface ResolvedLLM {
  client: OpenAI
  /** Primary model id, sent as `model`. */
  model: string
  /**
   * OpenRouter fallback chain (primary + fallbacks), or undefined. Sent as the
   * `models` field so OpenRouter fails over to the next id on error/rate-limit.
   * Note: fallback triggers on *availability*, not answer quality.
   */
  models?: string[]
  /** True when requests route through OpenRouter (vs direct OpenAI). */
  viaOpenRouter: boolean
}

function parseModelIds(modelEnv: string | undefined, defaultModel: string): string[] {
  const ids = (modelEnv ?? defaultModel)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length > 0 ? ids : [defaultModel]
}

/**
 * The model id we record for provenance/logging — the primary, normalised for
 * whichever provider is active. Cheap and side-effect-free; safe to call in a
 * catch block where the resolved client may be out of scope.
 */
export function primaryModelId(modelEnv: string | undefined, defaultModel: string = DEFAULT_LLM_MODEL): string {
  const first = parseModelIds(modelEnv, defaultModel)[0]
  return process.env.OPENROUTER_API_KEY ? first : first.replace(/^openai\//, "")
}

/**
 * Build a client + resolved model config for a route. Returns null when no key
 * is configured, so callers keep their existing 503 / dev-fallback behaviour.
 *
 * @param modelEnv     comma-separated model ids — first is primary, rest are
 *                     OpenRouter fallbacks (ignored on the direct-OpenAI path).
 * @param defaultModel used when `modelEnv` is unset/empty.
 */
export function getLLM(
  modelEnv: string | undefined,
  defaultModel: string = DEFAULT_LLM_MODEL,
): ResolvedLLM | null {
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const openAiKey = process.env.OPENAI_API_KEY
  const viaOpenRouter = Boolean(openRouterKey)
  const apiKey = openRouterKey ?? openAiKey
  if (!apiKey) return null

  const baseURL = process.env.LLM_BASE_URL ?? (viaOpenRouter ? OPENROUTER_BASE_URL : undefined)

  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(viaOpenRouter
      ? {
          // Optional attribution headers OpenRouter uses for its usage
          // leaderboard — harmless if unset.
          defaultHeaders: {
            "HTTP-Referer": process.env.LLM_SITE_URL ?? "https://kitchen-inventory.app",
            "X-Title": process.env.LLM_APP_NAME ?? "Kitchen Inventory",
          },
        }
      : {}),
  })

  let ids = parseModelIds(modelEnv, defaultModel)

  if (!viaOpenRouter) {
    // Direct OpenAI rejects namespaced ids and has no fallback-array support.
    ids = ids.map((id) => id.replace(/^openai\//, ""))
    return { client, model: ids[0], viaOpenRouter }
  }

  return {
    client,
    model: ids[0],
    models: ids.length > 1 ? ids : undefined,
    viaOpenRouter,
  }
}
