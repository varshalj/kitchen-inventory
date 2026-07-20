# Known limitations

Platform / technical constraints we've hit that we can't fully solve yet.
Each entry records the symptom, root cause, what we ruled out, the current
mitigation, and open avenues — so we can revisit with fresh options or take the
question to the wider community rather than rediscovering the wall each time.

---

## 1. Price-comparison deeplinks break in the installed PWA

**Status:** open · mitigated by gating · _identified 2026-07-11_
**Area:** shopping / Buy sheet · price comparison (PR #82, gated in #83)

### Symptom
From the app **installed to the home screen (standalone PWA)**, the Buy sheet's
"Compare prices" deeplink to a quick-commerce aggregator
([quickcompare.in](https://quickcompare.in), [comparify.pro](https://comparify.pro))
shows a **default/incorrect delivery location** (QuickCompare) or **"no products
found" / no location** (Comparify). In a normal browser tab it works.

### Root cause
An installed PWA opens external links in an **isolated in-app web view** whose
`localStorage` is not shared with the user's Safari. The aggregators persist the
chosen delivery location in their own `localStorage`, so in the fresh web-view
context they have no location → wrong or empty prices. Separately, **universal
links don't hand off to the aggregators' native apps from inside a web view**
(and even less so from a programmatic `window.open`), so we can't route the user
to their app where the location is already set.

### Ruled out
- **Pass location via a URL param** (pincode / lat-lng) — the cleanest,
  context-independent fix. **Confirmed the aggregators do _not_ accept a location
  parameter** in their search URLs (checked 2026-07-11). Dead end for now.
- **Force-open in the system browser (Safari)** — no reliable JS API exists for
  a standalone iOS PWA to open a link in the real Safari or share its storage.
- **Native-app handoff via `window.open`** — web views suppress universal-link
  routing; unreliable.
- **Native-app handoff via a real `<a href>` tap** (probe #84) — **ruled out by
  evidence** (2026-07-12). Whether an https link opens an app is the destination
  domain's responsibility: it must publish a universal-links association
  (iOS `/.well-known/apple-app-site-association`, Android `/.well-known/assetlinks.json`)
  and the app must declare the associated domain. Checked:
  - `blinkit.com` → **valid AASA** (appIDs `…com.grofers.consumer`, paths incl.
    `/s/*` search) → its links open the Blinkit app. Same for the other mature
    commerce apps (Swiggy, Zepto, Flipkart, Amazon) — which is *why* those hand off.
  - `comparify.pro` → **404, no AASA**. `quickcompare.in` → **no AASA** (serves its
    HTML page). No association ⇒ nothing for the OS to route to ⇒ the link can only
    open the website. **No client-side change (anchor, scheme, etc.) can fix this**
    — it requires the aggregators to publish universal-links config or an API.

### Current mitigation (PR #83, re-affirmed after #84)
- `priceComparison` setting defaults to `off` (opt-in).
- The action is **hidden in standalone-PWA mode** (`useIsStandalonePWA`) and only
  shown in a real browser tab, where storage is shared with the user's context.
- Settings copy states the browser-only limitation.
- The Compare deeplink uses a real `<a href>` (kept from probe #84) rather than
  `window.open` — harmless and marginally better, though it doesn't change the
  outcome here since the providers publish no universal-links association.

The default and the standalone gate are one-line reversible once a reliable
approach exists.

### Avenues to explore / ask the community
- **Native shell** (Capacitor/Tauri wrapper) with an in-app-browser plugin or
  `_system` target that opens the real browser / shares cookies — changes the
  distribution model, but would remove the web-view isolation entirely.
- **Does either aggregator offer an API / affiliate feed?** If so, we could show
  prices in-app instead of deeplinking (also removes the location problem).
- **iOS behaviour** — confirm whether newer iOS versions route standalone-PWA
  external links through `SFSafariViewController` (which shares website data with
  Safari) vs an isolated `WKWebView`, and whether that can be influenced.
- **Community question to pose:** "From an installed iOS/Android PWA, how do you
  open a third-party site (or its native app) so it retains the user's
  previously-set location/localStorage, without shipping a native wrapper?"
