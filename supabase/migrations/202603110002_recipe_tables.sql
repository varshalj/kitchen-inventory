-- Recipe Import System: import jobs, saved recipes, and recipe ingredients

-- Track async recipe import jobs
CREATE TABLE public.recipe_imports (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  canonical_url text,
  platform text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'parsing', 'ready', 'saved', 'failed')),
  error_message text,
  raw_content text,
  raw_metadata jsonb,
  parsed_recipe jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_imports_select_own ON public.recipe_imports
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recipe_imports_insert_own ON public.recipe_imports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recipe_imports_update_own ON public.recipe_imports
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY recipe_imports_delete_own ON public.recipe_imports
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_recipe_imports_user_status ON public.recipe_imports (user_id, status);

-- Saved recipes after user review
CREATE TABLE public.recipes (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id text REFERENCES public.recipe_imports(id),
  title text NOT NULL,
  source_url text,
  source_platform text,
  servings integer,
  prep_time_minutes integer,
  cook_time_minutes integer,
  instructions jsonb,
  image_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_select_own ON public.recipes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recipes_insert_own ON public.recipes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recipes_update_own ON public.recipes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY recipes_delete_own ON public.recipes
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_recipes_user_created ON public.recipes (user_id, created_at DESC);

-- Recipe ingredients linked to a recipe
CREATE TABLE public.recipe_ingredients (
  id text PRIMARY KEY,
  recipe_id text NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  canonical_name text,
  quantity numeric(10,3),
  unit text,
  optional boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS via join: only the recipe owner can access ingredients
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_ingredients_select_own ON public.recipe_ingredients
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );
CREATE POLICY recipe_ingredients_insert_own ON public.recipe_ingredients
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );
CREATE POLICY recipe_ingredients_update_own ON public.recipe_ingredients
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );
CREATE POLICY recipe_ingredients_delete_own ON public.recipe_ingredients
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );

CREATE INDEX idx_recipe_ingredients_recipe ON public.recipe_ingredients (recipe_id, sort_order);
