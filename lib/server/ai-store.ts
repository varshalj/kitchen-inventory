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

export type AIInteractionSurface = "voice" | "photo"

export type AIInteraction = {
  id: string
  userId: string
  userInput: string
  /** Literal `completion.choices[0].message.content` string before JSON.parse / normalize. */
  modelRawText?: string | null
  /** Post-normalize JSON (was `model_raw_response` in earlier migrations). */
  modelNormalizedResponse: unknown
  parsedResponse: ProposalModelOutput | null
  status: "success" | "error"
  errorMessage?: string
  modelVersion?: string | null
  promptVersion?: string | null
  surface?: AIInteractionSurface | null
  imagePaths?: string[] | null
  createdAt: string
}

export function getUserConfidenceThreshold(_userId: string): number {
  return 0.75
}

export type LogAIInteractionInput = {
  userId: string
  userInput: string
  /** Literal model output string before any parsing/normalisation. Captured for SLM training. */
  modelRawText?: string | null
  /** Post-normalize JSON. Stored in `model_normalized_response`. */
  modelNormalizedResponse: unknown
  parsedResponse: ProposalModelOutput | unknown | null
  status: "success" | "error"
  errorMessage?: string
  modelVersion?: string | null
  promptVersion?: string | null
  surface?: AIInteractionSurface | null
  /** Supabase Storage keys for the images the model actually saw. */
  imagePaths?: string[] | null
  /** Pre-generated id so the caller can use it for storage paths before the row exists. */
  interactionId?: string
}

/**
 * Insert an `ai_interactions` row. Returns the inserted id (or null on failure).
 * Callers should pass `interactionId` if they generated one upfront for the image
 * storage path; otherwise the DB default fires.
 */
export async function logAIInteraction(input: LogAIInteractionInput): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin() as any
    const row: Record<string, unknown> = {
      user_id: input.userId,
      user_input: input.userInput,
      model_raw_text: input.modelRawText ?? null,
      model_normalized_response: input.modelNormalizedResponse ?? null,
      parsed_response: input.parsedResponse ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
      model_version: input.modelVersion ?? null,
      prompt_version: input.promptVersion ?? null,
      surface: input.surface ?? null,
      image_paths: input.imagePaths ?? null,
    }
    if (input.interactionId) row.id = input.interactionId

    const { data, error } = await supabase
      .from("ai_interactions")
      .insert(row)
      .select("id")
      .single()

    if (error) {
      console.error("ai_interactions insert failed:", error.message, error.code)
      return null
    }
    return (data?.id as string) ?? null
  } catch (err) {
    console.error("ai_interactions insert threw:", err)
    return null
  }
}
