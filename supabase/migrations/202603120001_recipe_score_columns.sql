-- Add pantry compatibility score columns to recipes table
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS pantry_compatibility_score integer,
  ADD COLUMN IF NOT EXISTS pantry_last_checked timestamptz;
