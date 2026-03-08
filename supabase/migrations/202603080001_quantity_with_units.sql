-- Allow decimal quantities (existing integers cast cleanly to numeric)
ALTER TABLE public.inventory_items
  ALTER COLUMN quantity TYPE numeric(10,3);

ALTER TABLE public.shopping_items
  ALTER COLUMN quantity TYPE numeric(10,3);

-- Add unit columns (nullable = backward compatible; existing rows get unit = NULL displayed as "pcs")
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS unit text;
