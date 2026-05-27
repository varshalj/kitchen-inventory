-- Track when a user explicitly dismissed the rating chip for a consumed item.
--
-- Today's modal-based review prompt has no concept of "I don't want to rate
-- this one" — users just click Skip and the prompt is gone for that session.
-- With the Zomato-style chip pattern (#1 in the inventory backlog) the chip
-- needs to know not to re-surface a dismissed item if/when we later load
-- the chip queue from the DB (v2). V1 uses a session-only queue, so this
-- column is captured but not yet queried back — added now to avoid a second
-- migration later.
--
-- NULL = never dismissed.   timestamptz = dismissal moment, in UTC.

ALTER TABLE public.inventory_items
  ADD COLUMN review_dismissed_at timestamptz;
