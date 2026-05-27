-- ============================================================================
-- Make `unit` mandatory on inventory_items and shopping_items.
--
-- Root cause being fixed: nullable unit + a display layer that silently renders
-- null as "pcs" produced bugs where "g" inventory items appeared as "pcs" in
-- the shopping list after consume. The actual data loss was at the WRITE side
-- (e.g. smart-suggestions.tsx creating items without unit), not the consume
-- path itself — but the display lie made it invisible until the user noticed.
--
-- Approach:
--   1. Backfill all existing null units to 'pcs' (the historical default).
--   2. Set DB-level DEFAULT 'pcs' so any future code path that omits unit
--      still produces a non-null row.
--   3. Add NOT NULL constraint to enforce the invariant going forward.
--
-- Archaeological signal "this row never had an explicit unit" is intentionally
-- lost — we don't need it, and keeping nulls forever leaves the same bug class
-- open.
-- ============================================================================

-- Backfill first so the NOT NULL constraint doesn't fail.
UPDATE public.inventory_items
SET unit = 'pcs'
WHERE unit IS NULL;

UPDATE public.shopping_items
SET unit = 'pcs'
WHERE unit IS NULL;

-- DB-level safety net: any insert that omits unit gets 'pcs' instead of NULL.
ALTER TABLE public.inventory_items
  ALTER COLUMN unit SET DEFAULT 'pcs';

ALTER TABLE public.shopping_items
  ALTER COLUMN unit SET DEFAULT 'pcs';

-- Enforce the invariant.
ALTER TABLE public.inventory_items
  ALTER COLUMN unit SET NOT NULL;

ALTER TABLE public.shopping_items
  ALTER COLUMN unit SET NOT NULL;
