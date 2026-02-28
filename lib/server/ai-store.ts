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

const aiInteractions: AIInteraction[] = []

// Simulated user_ai_settings table
const userAISettings = new Map<string, { confidence_threshold: number }>([["demo-user", { confidence_threshold: 0.8 }]])

export function getUserConfidenceThreshold(userId: string): number {
  return userAISettings.get(userId)?.confidence_threshold ?? 0.75
}

export function logAIInteraction(interaction: Omit<AIInteraction, "id" | "createdAt">) {
  aiInteractions.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...interaction,
  })
}
