-- Add preparation note and ingredient group to recipe_ingredients
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS preparation text,
  ADD COLUMN IF NOT EXISTS ingredient_group text;

-- Add total time for recipes where prep+cook are not split out
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS total_time_minutes integer;
