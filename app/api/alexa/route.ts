import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { supabaseAsUser } from "@/lib/server/supabase-as-user"
import { inventoryRepo } from "@/lib/server/repositories/inventory-repo"
import { shoppingRepo } from "@/lib/server/repositories/shopping-repo"

// Mirror of the matcher used by the MCP layer. Duplicated rather than imported
// from lib/mcp/tools.ts to avoid coupling — the MCP and voice surfaces should
// be independently evolvable. Keep these in sync if you change either.
function normalizeName(s: string): string {
  const n = s.trim().toLowerCase().replace(/\s+/g, " ")
  if (n.length > 3 && n.endsWith("ies")) return n.slice(0, -3) + "y"
  if (n.length > 3 && n.endsWith("oes")) return n.slice(0, -2)
  if (n.length > 3 && /(sh|ch|ss|x|z)es$/.test(n)) return n.slice(0, -2)
  if (n.endsWith("ss")) return n
  if (n.length > 1 && n.endsWith("s")) return n.slice(0, -1)
  return n
}

function speak(text: string, endSession = true) {
  return NextResponse.json({
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      shouldEndSession: endSession,
    },
  })
}

function getSlot(intent: any, name: string): string | undefined {
  const raw = intent?.slots?.[name]?.value
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function handleAddShoppingItem(intent: any, supabase: SupabaseClient) {
  const item = getSlot(intent, "item")
  if (!item) return speak("I didn't catch the item. Try again.")

  const target = normalizeName(item)
  const all = await shoppingRepo.list(supabase)
  const candidate = all.find(
    (i) => !i.completed && normalizeName(i.name) === target,
  )

  if (candidate) {
    const nextQty = (candidate.quantity ?? 0) + 1
    await shoppingRepo.update(supabase, candidate.id, { quantity: nextQty })
    return speak(`Updated ${candidate.name} on your shopping list to ${nextQty}.`)
  }

  await shoppingRepo.create(supabase, {
    id: crypto.randomUUID(),
    name: item,
    quantity: 1,
    completed: false,
    addedOn: new Date().toISOString(),
    addedFrom: "voice",
  })
  return speak(`Added ${item} to your shopping list.`)
}

async function handleListShopping(supabase: SupabaseClient) {
  const items = await shoppingRepo.list(supabase)
  const pending = items.filter((i) => !i.completed)
  if (pending.length === 0) return speak("Your shopping list is empty.")
  if (pending.length === 1) return speak(`You have one item: ${pending[0].name}.`)
  const top = pending.slice(0, 5).map((i) => i.name)
  const rest = pending.length > 5 ? `, and ${pending.length - 5} more` : ""
  return speak(`You have ${pending.length} items: ${top.join(", ")}${rest}.`)
}

async function handleMarkConsumed(intent: any, supabase: SupabaseClient) {
  const item = getSlot(intent, "item")
  if (!item) return speak("I didn't catch what you finished. Try again.")

  const target = normalizeName(item)
  const inventory = await inventoryRepo.list(supabase, false)
  const matches = inventory.filter((i) => normalizeName(i.name) === target)

  if (matches.length === 0) {
    return speak(`I couldn't find ${item} in your kitchen. Should I add it to the shopping list? Say yes or no.`, false)
  }
  if (matches.length > 1) {
    return speak(`You have ${matches.length} items matching ${item}. Mark them done in the app.`)
  }

  const target_ = matches[0]
  await inventoryRepo.update(supabase, target_.id, {
    quantity: 0,
    archived: true,
    archiveReason: "consumed",
    consumedOn: new Date().toISOString(),
  })
  await shoppingRepo.create(supabase, {
    id: crypto.randomUUID(),
    name: target_.name,
    quantity: target_.quantity && target_.quantity > 0 ? target_.quantity : 1,
    unit: target_.unit,
    category: target_.category,
    completed: false,
    addedOn: new Date().toISOString(),
    addedFrom: "consumed",
    brand: target_.brand,
    orderedFrom: target_.orderedFrom,
  })
  return speak(`Marked ${target_.name} as finished and added it back to your shopping list.`)
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return speak("Sorry, something went wrong.")
  }

  // Application-id binding: ensures another skill can't accidentally hit this
  // endpoint. Set ALEXA_SKILL_ID in Vercel env once the skill is created.
  // NOTE: full SignatureCertChainUrl validation is intentionally skipped — for
  // a private unpublished skill on a household-only endpoint, the obscurity of
  // the URL plus this app-id check is the realistic risk model. Add full crypto
  // verification before publishing.
  const expectedAppId = process.env.ALEXA_SKILL_ID
  const incomingAppId = body?.session?.application?.applicationId
  if (expectedAppId && incomingAppId !== expectedAppId) {
    // Return valid Alexa JSON instead of plain 403 so Alexa can speak the
    // error back instead of failing with INVALID_RESPONSE. Same security
    // effect (we still refuse to act), better diagnostic.
    console.warn("Alexa app-id mismatch", { incomingAppId, expectedAppId })
    return speak("This skill is not authorized for this endpoint.")
  }

  const requestType = body?.request?.type as string | undefined
  const intentName = body?.request?.intent?.name as string | undefined

  if (requestType === "LaunchRequest") {
    return speak("Kitchen ready. What would you like to do?", false)
  }
  if (requestType === "SessionEndedRequest") {
    return speak("")
  }
  if (requestType !== "IntentRequest" || !intentName) {
    return speak("Sorry, I didn't understand.")
  }

  // Built-in intents Alexa always sends — ack politely.
  if (intentName === "AMAZON.HelpIntent") {
    return speak(
      "You can say: add eggs to my list, what's on my shopping list, or I finished the milk.",
      false,
    )
  }
  if (intentName === "AMAZON.CancelIntent" || intentName === "AMAZON.StopIntent") {
    return speak("Okay.")
  }

  // Household identity for v1 — every voice request acts as this user. Move to
  // per-user (Alexa Account Linking → Supabase OAuth) when the family expands
  // beyond one Kitchen Inventory account.
  const householdUserId = process.env.ALEXA_HOUSEHOLD_USER_ID
  if (!householdUserId) {
    console.error("ALEXA_HOUSEHOLD_USER_ID is not set")
    return speak("This skill is not connected to a Kitchen Inventory account.")
  }

  let supabase: SupabaseClient
  try {
    supabase = supabaseAsUser(householdUserId)
  } catch (e) {
    console.error("supabaseAsUser failed:", e)
    return speak("There was a problem connecting to your kitchen.")
  }

  try {
    switch (intentName) {
      case "AddShoppingItemIntent":
        return await handleAddShoppingItem(body.request.intent, supabase)
      case "ListShoppingIntent":
        return await handleListShopping(supabase)
      case "MarkConsumedIntent":
        return await handleMarkConsumed(body.request.intent, supabase)
      default:
        return speak("I don't know how to do that yet.")
    }
  } catch (e) {
    console.error("Alexa intent failed:", intentName, e)
    return speak("Sorry, that didn't work. Try again in a moment.")
  }
}
