import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getUserConfidenceThreshold, logAIInteraction } from "@/lib/server/ai-store"
import { requireUser } from "@/lib/server/require-user"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import OpenAI from "openai"

// Bump this any time the system prompt is meaningfully edited so we can filter
// training data by prompt era. See migration 202605270001.
const PROMPT_VERSION = "propose-items-v3-categories-expanded"
const MODEL_VERSION = "gpt-4o-mini"
const STORAGE_BUCKET = "ai-scan-images"

const requestSchema = z.object({
  userInput: z.string().min(1),
  imageBase64: z.string().optional(),
  imagesBase64: z.array(z.string()).optional(),
})

const proposalSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().min(1),
  expiryDate: z.string().min(1),
  quantity: z.number().min(0.001),
  // Required: normalizeModelOutput coerces missing units to 'pcs' before validation,
  // matching the DB-level NOT NULL constraint (migration 202605270002).
  unit: z.string().min(1),
  price: z.string().optional(),
  // SLM-readiness — captured silently. All optional so the API stays
  // backward-compatible if the model omits them.
  name_raw: z.string().nullable().optional(),
  brand_raw: z.string().nullable().optional(),
  quantity_raw: z.string().nullable().optional(),
  price_source: z.enum(["receipt_line", "mrp", "order_total", "unknown"]).nullable().optional(),
})

const modelOutputSchema = z.object({
  proposals: z.array(proposalSchema),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0]
  return `You are an AI assistant that extracts grocery/kitchen inventory items from user descriptions or images.

Given a user's text description, an image of groceries, a receipt, product packaging, or a kitchen shelf/cabinet/refrigerator, extract each item and return structured JSON.

You are capable of visually recognizing products from kitchen shelves, pantry cabinets, and refrigerators. Identify products by their packaging shape, color, logo, and brand — even if labels are partially obscured or at an angle. For Indian households, recognize common brands: Aashirvaad, Tata, Amul, Maggi, MDH, Haldiram's, Fortune, Mother Dairy, Parle, Britannia, Nestlé, ITC, Dabur, Patanjali, MTR, Everest, and others.

If multiple images are provided, treat them as different views of the same kitchen or pantry. Extract ALL unique items across all images. Do NOT duplicate items that appear in multiple images — include each distinct product only once.

For each item, separate the brand name from the generic item name:
- "Amul Butter" → name: "Butter", brand: "Amul"
- "Maggi 2-Minute Noodles" → name: "Noodles", brand: "Maggi"
- "Tata Salt" → name: "Salt", brand: "Tata"
- "Aashirvaad Atta" → name: "Whole Wheat Flour", brand: "Aashirvaad"
- The "name" field must always be the generic product type — never include the brand in the name.
- If no brand is visible or identifiable, omit the "brand" field entirely.

Today's date is ${today}. Use this as the base when estimating expiry dates.
Typical shelf lives for reference: fresh produce 3-7 days, dairy 7-14 days, meat 2-5 days, bread 5-7 days, canned goods 1-2 years, frozen items 3-6 months, snacks/dry goods 1-6 months.

You MUST return a JSON object with exactly these keys:
- "proposals": an array of item objects, each with:
  - "name" (string): generic product type only — no brand (e.g. "Butter", not "Amul Butter")
  - "brand" (string, optional): brand name if identifiable (e.g. "Amul")
  - "category" (string): one of Fruits, Vegetables, Dairy, Meat, Grains, Canned, Frozen, Snacks, Beverages, Condiments, Spices, Dry Fruits, Supplement, Medicine, Other
    Category tiebreakers:
    - Dry Fruits vs Snacks: whole or sliced nuts and dried fruits as pantry ingredients (almonds, cashews, raisins, dates, walnuts, figs, pista) — even if roasted or salted — go to Dry Fruits. Packaged ready-to-eat with added flavorings or coatings (chocolate-covered almonds, namkeen, trail mix with seasoning) go to Snacks.
    - Supplement vs Medicine: vitamins, multivitamins, protein powder, mass gainer, omega-3, ashwagandha, herbal capsules go to Supplement. OTC and prescription drugs (paracetamol, ibuprofen, antacids, cough syrup, antibiotics, ointments) go to Medicine.
    - Condiments vs Spices: bottled/jarred sauces, ketchup, mayo, pickles go to Condiments. Whole or ground spices (turmeric, jeera, garam masala, salt, pepper) go to Spices.
  - "expiryDate" (string): estimated expiry date in YYYY-MM-DD format, calculated from today (${today})
  - "quantity" (number): numeric quantity value, can be decimal (e.g. 0.5, 2.5). Default 1.
  - "unit" (string): the unit for quantity. Valid units: pcs, g, kg, oz, lb, ml, L, fl oz, cup. Use "pcs" for countable items (e.g. eggs, apples). Use weight/volume units for bulk items (e.g. 500g flour, 1L milk). Default "pcs".
  - "price" (string, optional): price if visible
  - Provenance fields (REQUIRED — preserved verbatim for training data):
    - "name_raw" (string): the literal product text you read from the package, shelf label, or receipt line for THIS item (e.g. "Amul Butter Salted 500g", "AASHIRVAAD ATTA"). Preserve original casing. If from a text description, copy the substring the user wrote for this item.
    - "brand_raw" (string|null): the literal brand text exactly as printed on the package (e.g. "AMUL", "Aashirvaad"). Null if no brand visible.
    - "quantity_raw" (string|null): the literal quantity text as printed (e.g. "500g", "1L", "200 ml", "6 nos"). Null if no quantity visible.
    - "price_source" (string|null): one of "receipt_line" (printed/digital receipt), "mrp" (printed on packaging), "order_total" (delivery-order screenshot total), "unknown" (uncertain). Null if no price was extracted.
- "confidence" (number): a number between 0 and 1
- "reasoning" (string): a brief explanation of what was detected

Examples:
- 500g flour → {"quantity": 500, "unit": "g", "quantity_raw": "500g"}
- 1 litre milk → {"quantity": 1, "unit": "L", "quantity_raw": "1 litre"}
- 6 eggs → {"quantity": 6, "unit": "pcs", "quantity_raw": "6"}
- 250ml juice → {"quantity": 250, "unit": "ml", "quantity_raw": "250ml"}

Example response:
{"proposals":[{"name":"Butter","brand":"Amul","category":"Dairy","expiryDate":"${new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0]}","quantity":1,"unit":"pcs","name_raw":"Amul Butter Salted","brand_raw":"AMUL","quantity_raw":"500g","price_source":null}],"confidence":0.9,"reasoning":"Detected Amul Butter on shelf"}`
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

/**
 * GPT sometimes returns variations like "items" instead of "proposals",
 * or wraps the array in a different key, or omits confidence/reasoning.
 * This normalizes common variations into the expected shape.
 */
function normalizeModelOutput(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  if (!Array.isArray(normalized.proposals)) {
    for (const key of ["items", "results", "extracted_items"]) {
      if (Array.isArray(normalized[key])) {
        normalized.proposals = normalized[key]
        delete normalized[key]
        break
      }
    }
  }
  if (!Array.isArray(normalized.proposals)) {
    normalized.proposals = []
  }

  const sixMonthsOut = new Date()
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6)
  const defaultExpiry = sixMonthsOut.toISOString().split("T")[0]

  normalized.proposals = (normalized.proposals as Record<string, unknown>[])
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const out = { ...item }

      if (!out.expiryDate && out.expiry_date) { out.expiryDate = out.expiry_date; delete out.expiry_date }
      if (!out.expiryDate && out.expiration_date) { out.expiryDate = out.expiration_date; delete out.expiration_date }

      if (!out.name || typeof out.name !== "string" || !(out.name as string).trim()) {
        out.name = "Unknown Item"
      }
      if (!out.category || typeof out.category !== "string" || !(out.category as string).trim()) {
        out.category = "Other"
      }
      if (!out.expiryDate || typeof out.expiryDate !== "string" || !(out.expiryDate as string).trim()) {
        out.expiryDate = defaultExpiry
      }

      if (out.quantity === undefined || out.quantity === null) out.quantity = 1
      if (typeof out.quantity === "string") out.quantity = parseFloat(out.quantity as string) || 1
      if (typeof out.quantity !== "number" || (out.quantity as number) <= 0) out.quantity = 1

      if (!out.unit || typeof out.unit !== "string" || !(out.unit as string).trim()) out.unit = "pcs"

      if (typeof out.price === "number") out.price = String(out.price)

      // Normalise provenance keys — model might emit snake_case OR camelCase.
      if (out.nameRaw && !out.name_raw) { out.name_raw = out.nameRaw; delete out.nameRaw }
      if (out.brandRaw && !out.brand_raw) { out.brand_raw = out.brandRaw; delete out.brandRaw }
      if (out.quantityRaw && !out.quantity_raw) { out.quantity_raw = out.quantityRaw; delete out.quantityRaw }
      if (out.priceSource && !out.price_source) { out.price_source = out.priceSource; delete out.priceSource }

      return out
    })

  if (typeof normalized.confidence !== "number" || normalized.confidence < 0 || normalized.confidence > 1) {
    normalized.confidence = 0.8
  }
  if (typeof normalized.reasoning !== "string" || !normalized.reasoning) {
    normalized.reasoning = "Items extracted from input"
  }

  return normalized
}

async function callModel(
  client: OpenAI,
  userInput: string,
  imageBase64?: string,
  imagesBase64?: string[],
): Promise<{ rawText: string; normalized: unknown }> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
  ]

  if (imagesBase64 && imagesBase64.length > 0) {
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imagesBase64.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
        detail: "auto" as const,
      },
    }))
    messages.push({
      role: "user",
      content: [{ type: "text", text: userInput }, ...imageBlocks],
    })
  } else if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userInput },
        {
          type: "image_url",
          image_url: {
            url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            detail: "auto" as const,
          },
        },
      ],
    })
  } else {
    messages.push({ role: "user", content: userInput })
  }

  const completion = await client.chat.completions.create({
    model: MODEL_VERSION,
    messages,
    response_format: { type: "json_object" },
    max_tokens: imagesBase64 && imagesBase64.length > 1 ? 4096 : 2048,
    temperature: 0.3,
  })

  const rawText = completion.choices[0]?.message?.content ?? ""
  if (!rawText) throw new Error("Empty response from OpenAI")

  const parsed = JSON.parse(rawText)
  return { rawText, normalized: normalizeModelOutput(parsed) }
}

function fallbackModelOutput(userInput: string) {
  const today = new Date()
  return {
    proposals: [
      {
        name: "Organic Milk",
        category: "Dairy",
        expiryDate: new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0],
        quantity: 1,
        price: "65",
        name_raw: "Organic Milk",
        brand_raw: null,
        quantity_raw: "1L",
        price_source: "unknown",
      },
      {
        name: "Eggs",
        category: "Dairy",
        expiryDate: new Date(today.getTime() + 14 * 86400000).toISOString().split("T")[0],
        quantity: 12,
        price: "89",
        name_raw: "Eggs",
        brand_raw: null,
        quantity_raw: "12",
        price_source: "unknown",
      },
    ],
    confidence: 0.86,
    reasoning: `Fallback proposals generated for input: ${userInput.slice(0, 120)}`,
  }
}

/**
 * Upload a base64-encoded image (with or without data: prefix) to Supabase Storage
 * at the canonical path. Returns the storage key on success, null on failure.
 * Failures are non-fatal — we'd rather lose the image than the whole interaction.
 */
async function uploadScanImage(
  userId: string,
  interactionId: string,
  index: number,
  imageBase64: string,
): Promise<string | null> {
  try {
    const dataPart = imageBase64.startsWith("data:") ? imageBase64.split(",", 2)[1] : imageBase64
    if (!dataPart) return null
    const buffer = Buffer.from(dataPart, "base64")
    const path = `${userId}/${interactionId}/${index}.jpg`
    const admin = getSupabaseAdmin()
    const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    })
    if (error) {
      console.error("scan image upload failed:", error.message)
      return null
    }
    return path
  } catch (err) {
    console.error("scan image upload threw:", err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsedRequest = requestSchema.safeParse(body)

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsedRequest.error.flatten() }, { status: 400 })
  }

  const { userInput, imageBase64, imagesBase64 } = parsedRequest.data

  if (imagesBase64 && imagesBase64.length > 5) {
    return NextResponse.json({ error: "Max 5 images allowed" }, { status: 400 })
  }

  const userId = user.id
  // Pre-generate id so we can use it for the image storage path; the row is
  // inserted via logAIInteraction at the end with the same id.
  const interactionId = crypto.randomUUID()

  try {
    const client = getOpenAIClient()

    // ── Dev fallback: no OPENAI_API_KEY. Skip image upload + logging. ──
    if (!client) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("OPENAI_API_KEY is not configured")
      }
      const fallback = fallbackModelOutput(userInput)
      return NextResponse.json({
        ...fallback,
        confidenceThreshold: getUserConfidenceThreshold(userId),
        canBulkApply: fallback.confidence >= getUserConfidenceThreshold(userId),
      })
    }

    // ── Upload images first so we can log image_paths atomically with the row. ──
    const imagesToUpload: string[] = imagesBase64 && imagesBase64.length > 0
      ? imagesBase64
      : imageBase64
        ? [imageBase64]
        : []
    const imagePaths: string[] = []
    for (let i = 0; i < imagesToUpload.length; i++) {
      const path = await uploadScanImage(userId, interactionId, i, imagesToUpload[i])
      if (path) imagePaths.push(path)
    }

    // ── Call the model and capture the LITERAL string before any parsing. ──
    const { rawText, normalized } = await callModel(client, userInput, imageBase64, imagesBase64)
    const parsedOutput = modelOutputSchema.safeParse(normalized)

    if (!parsedOutput.success) {
      console.error("Zod validation failed:", JSON.stringify(parsedOutput.error.flatten()), "Raw:", rawText.slice(0, 500))

      await logAIInteraction({
        interactionId,
        userId,
        userInput,
        modelRawText: rawText,
        modelNormalizedResponse: normalized,
        parsedResponse: null,
        status: "error",
        errorMessage: parsedOutput.error.message,
        modelVersion: MODEL_VERSION,
        promptVersion: PROMPT_VERSION,
        surface: "photo",
        imagePaths: imagePaths.length > 0 ? imagePaths : null,
      })

      return NextResponse.json(
        { error: "Could not parse AI response. Please try again.", details: parsedOutput.error.flatten() },
        { status: 422 },
      )
    }

    await logAIInteraction({
      interactionId,
      userId,
      userInput,
      modelRawText: rawText,
      modelNormalizedResponse: normalized,
      parsedResponse: parsedOutput.data,
      status: "success",
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      surface: "photo",
      imagePaths: imagePaths.length > 0 ? imagePaths : null,
    })

    const threshold = getUserConfidenceThreshold(userId)

    return NextResponse.json({
      ...parsedOutput.data,
      confidenceThreshold: threshold,
      canBulkApply: parsedOutput.data.confidence >= threshold,
      aiInteractionId: interactionId,
      imagePaths,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model error"

    await logAIInteraction({
      interactionId,
      userId,
      userInput,
      modelRawText: null,
      modelNormalizedResponse: null,
      parsedResponse: null,
      status: "error",
      errorMessage: message,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      surface: "photo",
    })

    const status = message.includes("not configured") ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
