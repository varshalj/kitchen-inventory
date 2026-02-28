export async function validateOpenAiKey({ apiKey, model }: { apiKey: string; model: string }) {
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Provider validation failed (${response.status}): ${body.slice(0, 240)}`)
  }

  return true
}
