# MCP server — backlog

What's deferred from the current MCP work and the conditions under which we'd revisit. Roughly ordered by next-pickup priority within each phase. Living doc — strike items as they ship, demote / promote as evidence comes in.

---

## Already shipped (for context)

- Read-only tools: `list_inventory`, `get_expiring_soon`, `list_shopping`, `list_recipes`, `get_recipe`, `suggest_meals`, `get_waste_stats`, `search_inventory`
- Write tools: `add_to_shopping_list`, `mark_as_consumed`
- Shopping-list lifecycle: `remove_from_shopping_list`, `update_shopping_item`
- Naive name normalization (case + singular/plural collapse) used for matching across writes
- Dry-run by default on every write tool (`confirm: false` returns a preview; caller must repeat with `confirm: true`)
- `outputSchema` + `structuredContent` for the four write tools
- Migration `202605200001_add_agent_to_added_from.sql` widening `shopping_items.added_from` to include `'agent'`
- `addedFrom: "agent"` provenance tag on agent-driven shopping inserts

---

## Phase 1 — reliability & agent safety

### Soft undo: `restore_inventory_item(item_id)`
- **What:** flip `archived=false`, clear `consumed_on`/`wasted_on`/`archive_reason` for a given inventory id.
- **Why now? not yet:** the dry-run default makes accidental archives much rarer. Ship the cheap undo only once we see the first agent-mark-consume that the user can't easily fix from the web UI.
- **Cost:** small. `inventoryRepo.update` already does the mutation; needs a new MCP tool definition + handler + outputSchema. No migration.

### Audit log + rollback
- **What:** `agent_actions` table recording `(action_id, user_id, tool, args, prior_state, new_state, ts)`. New tools `list_recent_actions`, `rollback_action(action_id)`.
- **Why not yet:** heavier than soft-undo. Only justified if soft-undo proves insufficient — e.g., consume cascades across multiple rows or workflow primitives that touch many tables per call.
- **Cost:** migration + write-side logging in every tool + new read/rollback tools. Two days of work, not two hours.

### `outputSchema` for the read tools
- **What:** declare `outputSchema` on `list_inventory`, `get_expiring_soon`, `list_shopping`, `list_recipes`, `get_recipe`, `suggest_meals`, `get_waste_stats`, `search_inventory`.
- **Why not yet:** writes have branching shapes (`executed` vs `dry_run`) where schemas help most. Reads return arrays of well-described domain objects; the description text already covers what the agent needs.
- **Trigger to pick up:** when a client inspector flags read tools too, or when we start chaining read → write and the agent needs typed output to route decisions.

### Server-side confirm-policy enforcement per OAuth client
- **What:** the dry-run-default is already enforced server-side, but a malicious client could just always pass `confirm: true`. If/when we have multiple agent clients with different trust levels, allow per-client override (e.g., one client may skip dry-run; another must always preview).
- **Why not yet:** only one agent client (Hermes) so far. Premature for v1.

---

## Phase 2 — data correctness

### `decrement_inventory(item_id, quantity, unit)`
- **What:** support partial consumption ("ate 20 g of almonds") instead of archive-only.
- **Blocked on a schema decision:**
  - `inventory_items.quantity` is `integer`. Options: (a) widen to `numeric`, or (b) store weight-in-grams natively as `int` and convert at presentation.
  - `partially_consumed` and `partially_consumed_at` columns exist but are only half-used today — clean up the semantics before adding this tool.
  - Unit handling (next item) needs to land first so decrement can compare "20 g" against "200 g almonds."
- **Trigger to pick up:** when "consume all" produces obviously wrong shopping-list behavior — i.e., the shopping list fills with restock entries after every small consumption. Hermes traffic is the leading indicator.

### Canonical-name table + explicit aliases
- **What:** replace the inline `normalizeName()` with an `item_aliases` table mapping user-typed strings to a canonical product id. Tools operate on IDs.
- **Why not yet:** the naive normalizer covers ~80% of cases (singular/plural + case) for free. Adding a real alias table costs a migration and adds an "alias maintenance" workflow.
- **Trigger to pick up:** when normalizer mistakes start mattering in practice — either false collisions ("cooky" / "cookie" — actually a false miss; the rule strips trailing s only) or false misses ("bell pepper" vs "capsicum", "atta" vs "wheat flour"). Likely around 300+ inventory items.

### Unit normalization / conversion layer
- **What:** enforce a unit enum at the DB level (g, kg, ml, L, pcs, …), add a conversion layer for analytics and recipe matching, reject nonsensical combinations.
- **Layer:** primarily a *schema* change, not an MCP change. The MCP should follow the schema.
- **Trigger:** when shopping aggregation or recipe-pantry matching is visibly broken because of unit chaos. Currently the inconsistencies cause silent noise, not loud failures.

### Category taxonomy cleanup
- **What:** move from single-enum `category` to a controlled taxonomy + optional multi-tags. Includes one-off cleanup of existing rows (the "Baking soda → Dairy" type messes).
- **Layer:** schema + UI input, not MCP.
- **Trigger:** when categorization hurts a real feature — recipe suggestions, nutrition modeling, analytics dashboards.

---

## Phase 3 — agent-native workflows

### Workflow primitives: `log_meal`, `restock_weekly_staples`, etc.
- **What:** intent-level tools that decompose into multiple CRUD calls under the hood.
- **Hard prerequisite:** Phase-1 reliability (undo / audit) must be solid. A `log_meal` call that decrements 8 ingredients has 8 ways to misfire; without rollback, a single bad meal-log scrambles the pantry.
- **Trigger:** only after soft-undo (or audit log) has run for a few weeks without incident.

### Replenishment thresholds
- **What:** per-item `restock_threshold` + `target_quantity` columns; auto-shopping-list insert when on-hand falls below threshold.
- **Hard prerequisite:** `decrement_inventory` must ship first. Without partial decrement, "below threshold" doesn't have a meaning that matches reality.

### Freshness intelligence
- **What:** beyond `get_expiring_soon` — predicted shelf life, decay scoring, "consume soon" ranking informed by category + storage location + brand.
- **Status:** roadmap. Not a v1 reliability concern.

---

## Notes on what we explicitly chose NOT to do

- **Confidence-scored candidates on ambiguous matches.** ChatGPT proposed adding per-candidate scores like `{ score: 0.91 }`. Skipped — we already return the candidate list, the agent can rank itself, and the highest-leverage fix is *more* things landing in `ambiguous` (which naive normalization now does), not finer ordering of the 2–3 that do.
- **Decoupling consume from auto-restock.** ChatGPT proposed making `restock` optional. The user explicitly chose to mirror the web UI's "consume → also add to shopping list" default, with a `quantity` override knob. If the auto-restock proves wrong in practice, the fastest patch is a `restock` boolean param defaulting to `true`.
- **Bumping the MCP protocol version.** Adding `outputSchema` and `structuredContent` is forward-compatible — modern clients (ChatGPT, Claude Desktop, Cursor) recognize them regardless of the declared protocol version. Bumping is deferred until we adopt a feature that actually requires version negotiation.
