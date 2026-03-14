ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_bookmark boolean NOT NULL DEFAULT false;
