/**
 * Server-side feature gate for the voice mic button.
 *
 * Renders <VoiceMicButton /> only if:
 *   1. The current request is from an authenticated user, AND
 *   2. That user has feature_grants.voice_agent_enabled = true
 *
 * Performed server-side (Next.js async server component) so unauthorized
 * users never receive the client-side voice code in their bundle, and
 * there's no "render then hide" flicker.
 *
 * Mounted from app/layout.tsx — appears globally across all pages where
 * the feature flag is granted. Path-based exclusions (e.g. don't show
 * on /auth) aren't needed: unauthenticated requests get null naturally,
 * and the marketing/onboarding pages don't have authenticated sessions.
 */

import { createSupabaseFromRequest } from "@/lib/server/create-supabase-server"
import { VoiceMicButton } from "./voice-mic-button"

export async function VoiceMicGated() {
  // Defensive: never let an error in the feature-gate check break the
  // surrounding page render. If anything blows up, just don't show the
  // button.
  try {
    const supabase = await createSupabaseFromRequest()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from("feature_grants")
      .select("voice_agent_enabled")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (error || !data?.voice_agent_enabled) return null

    return <VoiceMicButton />
  } catch {
    return null
  }
}
