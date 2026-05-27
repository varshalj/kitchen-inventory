# Alexa skill setup — household voice for Kitchen Inventory

End-to-end steps to point an Echo at your deployed Kitchen Inventory and run voice commands like *"Alexa, ask KitchenMate to add eggs to my list."* Targeted at private household use — the skill stays unpublished so there's no Amazon certification.

Estimated time: **one focused day**, mostly Alexa Developer Console fiddling.

---

## What's already in the repo

- **[app/api/alexa/route.ts](../app/api/alexa/route.ts)** — the HTTPS endpoint Alexa POSTs to. Handles three intents (`AddShoppingItemIntent`, `ListShoppingIntent`, `MarkConsumedIntent`) plus the built-in launch / cancel / help / stop intents.
- **[lib/server/supabase-as-user.ts](../lib/server/supabase-as-user.ts)** — mints a short-lived Supabase JWT for the configured household user so the existing repos work under RLS.
- **[.env.example](../.env.example)** — the new env vars you'll need.

## Step 1 — Find your Supabase identifiers

You need two things from the Supabase dashboard:

1. **JWT Secret** — *Project Settings → API → JWT Secret*. Long string, used by `supabase-as-user.ts` to sign session tokens.
2. **Your user UUID** — log into the Kitchen Inventory web app as the account the household should share, then either (a) check `auth.users` in the Supabase SQL editor for your email, or (b) paste this in the browser console: `(await window.__supabase?.auth.getUser())?.data?.user?.id`. Either way you want the `uuid` Supabase issued you when you signed up.

## Step 2 — Set the env vars on Vercel

In your Vercel project → Settings → Environment Variables, add:

```
SUPABASE_JWT_SECRET=<from step 1>
ALEXA_HOUSEHOLD_USER_ID=<your user uuid>
ALEXA_SKILL_ID=            # leave blank for now; fill in step 4
```

Redeploy (or `vercel --prod`) so the new env vars are live.

## Step 3 — Create the skill in the Alexa Developer Console

1. Go to [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) and sign in with the Amazon account that owns your Echo. *Same account* — this is what lets the skill run on your device without publishing.
2. Click **Create Skill**.
3. Skill name: `Kitchen Inventory` (or whatever you like — this is the developer-facing name).
4. Primary locale: `English (US)` or your locale. You can add more later.
5. Choose **Custom** model, **Provision your own** hosting.
6. Template: **Start from scratch**.
7. Click Create.

## Step 4 — Paste the interaction model

In the left sidebar: **Interaction Model → JSON Editor**. Replace whatever's there with:

```json
{
  "interactionModel": {
    "languageModel": {
      "invocationName": "kitchen mate",
      "intents": [
        { "name": "AMAZON.CancelIntent", "samples": [] },
        { "name": "AMAZON.HelpIntent", "samples": [] },
        { "name": "AMAZON.StopIntent", "samples": [] },
        { "name": "AMAZON.NavigateHomeIntent", "samples": [] },
        {
          "name": "AddShoppingItemIntent",
          "slots": [
            { "name": "item", "type": "AMAZON.SearchQuery" }
          ],
          "samples": [
            "add {item} to my shopping list",
            "add {item} to the list",
            "put {item} on my shopping list",
            "put {item} on the list",
            "I need to buy {item}",
            "we need {item}",
            "we are out of {item}"
          ]
        },
        {
          "name": "ListShoppingIntent",
          "slots": [],
          "samples": [
            "what's on my shopping list",
            "what is on my shopping list",
            "read my shopping list",
            "what do I need to buy",
            "what's on the list"
          ]
        },
        {
          "name": "MarkConsumedIntent",
          "slots": [
            { "name": "item", "type": "AMAZON.SearchQuery" }
          ],
          "samples": [
            "I finished the {item}",
            "we finished the {item}",
            "we are out of the {item}",
            "mark {item} as done",
            "I used the {item}",
            "we used up the {item}"
          ]
        }
      ],
      "types": []
    }
  }
}
```

Click **Save Model**, then **Build Model**. Build takes 1–2 minutes.

> **Why a custom `GroceryItem` slot type and not `AMAZON.SearchQuery`:** `AMAZON.SearchQuery` has severe restrictions in one-shot invocations (the *"Alexa, ask pantry bro to add eggs to my list"* pattern), and Alexa silently routes to `AMAZON.FallbackIntent` instead of matching your intent. Custom slot types don't have this problem and let Alexa actually extract the item name. The slot is extensible — items not in the seed list still get matched, just with weaker confidence. Add more values as you discover your household's vocabulary.

> **Note on invocation name:** *"kitchen mate"* works because it's two words and not a brand. Avoid anything that overlaps with Alexa's built-in commands. Test by saying it out loud — if it doesn't trip Alexa reliably, pick a different one.

## Step 5 — Point the skill at your Vercel endpoint

1. In the left sidebar: **Endpoint**.
2. Service Endpoint Type: **HTTPS**.
3. Default Region: `https://<your-vercel-domain>/api/alexa`.
4. SSL certificate type: **My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority** (Vercel's default cert qualifies).
5. Save Endpoints.

Then copy the **Skill ID** from the top of the sidebar (looks like `amzn1.ask.skill.<uuid>`) into `ALEXA_SKILL_ID` in Vercel env vars, and redeploy. This binds the route so only this skill can invoke it.

## Step 6 — Enable on your Echo

1. In the developer console, go to **Test** tab.
2. Set the testing toggle to **Development**.
3. Your Echo (linked to the same Amazon account) now has access to the skill automatically — no enable step needed.

## Step 7 — Try it

Say to your Echo:

- *"Alexa, ask kitchen mate to add eggs to my shopping list."* → "Added eggs to your shopping list."
- *"Alexa, ask kitchen mate what's on my shopping list."* → "You have 3 items: eggs, milk, bread."
- *"Alexa, ask kitchen mate I finished the yogurt."* → "Marked yogurt as finished and added it back to your shopping list."

Check the Kitchen Inventory web app — the items should be there immediately.

---

## Iterating on utterances

The first round of testing will surface phrasings Alexa fails to recognize. Each fix is:

1. Open the skill in the developer console.
2. Interaction Model → JSON Editor.
3. Add the new phrasing as a sample under the right intent.
4. Build Model.
5. Try again on Echo.

A few minutes per iteration. Plan for a few rounds before it feels natural.

---

## Known limitations (intentional v1 shortcuts)

- **Full Alexa signature verification is skipped.** The route checks the `applicationId` matches `ALEXA_SKILL_ID`, but doesn't validate Amazon's `SignatureCertChainUrl`. Acceptable for a private dev-mode skill on an obscure URL; **must be added before publishing**. The [official spec](https://developer.amazon.com/en-US/docs/alexa/custom-skills/handle-requests-sent-by-alexa.html) describes the steps.
- **Household-shared identity.** Every voice request acts as the user whose UUID is in `ALEXA_HOUSEHOLD_USER_ID`. If you and your wife both have separate Kitchen Inventory accounts, only one of them is reachable via voice. To split: implement Alexa Account Linking pointing at Supabase OAuth — the [/authorize](../app/authorize/page.tsx) page already supports it.
- **`MarkConsumedIntent` on ambiguous items refuses gracefully** instead of disambiguating verbally. Resolving "which carton of milk" via voice is its own UX project; not in v1.
- **No "yes / no" follow-up parsing.** If the `MarkConsumedIntent` handler asks *"Should I add it to the shopping list?"*, Alexa keeps the session open but the route doesn't currently handle the follow-up turn. Punted to v2.
