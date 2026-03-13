-- Add 'deleted' as a valid status for recipe_imports
-- Required so that when a recipe is deleted via the app or directly from DB,
-- the import record can be reset to allow re-importing the same URL.
ALTER TABLE public.recipe_imports
  DROP CONSTRAINT recipe_imports_status_check,
  ADD CONSTRAINT recipe_imports_status_check
    CHECK (status IN ('pending', 'extracting', 'parsing', 'ready', 'saved', 'failed', 'deleted'));
