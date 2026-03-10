-- Allow 'voice' as a valid source for shopping items added via voice capture
ALTER TABLE public.shopping_items
  DROP CONSTRAINT IF EXISTS shopping_items_added_from_check;

ALTER TABLE public.shopping_items
  ADD CONSTRAINT shopping_items_added_from_check
    CHECK (added_from IN ('consumed', 'manual', 'voice'));
