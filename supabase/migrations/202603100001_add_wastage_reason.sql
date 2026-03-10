-- Capture why an item was wasted for smarter shopping nudges
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS wastage_reason text;
