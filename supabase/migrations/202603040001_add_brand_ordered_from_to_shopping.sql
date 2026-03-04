ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS ordered_from TEXT;
