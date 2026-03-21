import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

export type Proposal = {
  name: string
  category: string
  expiryDate: string
  quantity: number
  price?: string
}

export type ProposalModelOutput = {
  proposals: Proposal[]
  confidence: number
  reasoning: string
}

export type AIInteraction = {
  id: string
  userId: string
  userInput: string
  modelRawResponse: unknown
  parsedResponse: ProposalModelOutput | null
  status: "success" | "error"
  errorMessage?: string
  createdAt: string
}

export function getUserConfidenceThreshold(_userId: string): number {
  return 0.75
}

export async function logAIInteraction(interaction: Omit<AIInteraction, "id" | "createdAt">) {
  try {
    // Cast to any because the Supabase client is not typed with a generated Database schema.
    // The table exists but isn't in the type definitions, so TypeScript resolves the
    // row type as `never` without this cast.
    const supabase = getSupabaseAdmin() as any
    const { error } = await supabase.from("ai_interactions").insert({
      user_id: interaction.userId,
      user_input: interaction.userInput,
      model_raw_response: interaction.modelRawResponse ?? null,
      parsed_response: interaction.parsedResponse ?? null,
      status: interaction.status,
      error_message: interaction.errorMessage ?? null,
    })
    if (error) console.error("ai_interactions insert failed:", error.message, error.code)
  } catch (err) {
    console.error("ai_interactions insert threw:", err)
  }
}
