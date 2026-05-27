-- ============================================================================
-- SLM-readiness migration for the photo-scan / voice AI capture flow.
--
-- Goal: today's data capture won't block fine-tuning a small open-weights
-- model (Qwen/Mistral/etc.) 3-6 months from now. We need to be able to
-- export (input → raw model output → user-approved output) triplets.
--
-- See BACKLOG / Step 1-4 design doc for the full rationale per field.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1: ai_interactions — rename misnamed column + additive columns.
--
-- The existing `model_raw_response` column is misnamed: it holds the
-- POST-`normalizeModelOutput` JSON, not the raw API response. Rename now,
-- while no production training data has been mined yet.
-- ----------------------------------------------------------------------------

ALTER TABLE public.ai_interactions
  RENAME COLUMN model_raw_response TO model_normalized_response;

ALTER TABLE public.ai_interactions
  ADD COLUMN model_raw_text text,                     -- literal content string before JSON.parse + normalize
  ADD COLUMN model_version text,                      -- e.g. 'gpt-4o-mini'
  ADD COLUMN prompt_version text,                     -- e.g. 'voice-v1', bumped on prompt edits
  ADD COLUMN surface text,                            -- 'voice' | 'photo'
  ADD COLUMN image_paths text[],                      -- Supabase Storage keys for the images the model saw
  ADD COLUMN approved_payload jsonb,                  -- leg (c) — final user-approved items at save time
  ADD COLUMN had_corrections boolean;                 -- true if approved_payload differs from raw output

ALTER TABLE public.ai_interactions
  ADD CONSTRAINT ai_interactions_surface_check
  CHECK (surface IS NULL OR surface IN ('voice', 'photo'));

-- ----------------------------------------------------------------------------
-- Part 2: inventory_items — additive columns for SLM provenance.
-- ----------------------------------------------------------------------------

ALTER TABLE public.inventory_items
  ADD COLUMN ai_interaction_id uuid REFERENCES public.ai_interactions(id) ON DELETE SET NULL,
  ADD COLUMN name_raw text,                           -- literal as-spoken (voice) or as-seen (photo)
  ADD COLUMN brand_raw text,                          -- literal package text; brand_cleaned stays in `brand`
  ADD COLUMN quantity_raw text,                       -- e.g. "half kg", "500g" — pre client-side normalisation
  ADD COLUMN expiry_source text,                      -- 'model' | 'client_default' | 'user_edit'
  ADD COLUMN price_source text,                       -- 'receipt_line' | 'mrp' | 'order_total' | 'unknown'
  ADD COLUMN extracted_extras jsonb;                  -- future-proof bucket for fields not yet promoted

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_expiry_source_check
  CHECK (expiry_source IS NULL OR expiry_source IN ('model', 'client_default', 'user_edit'));

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_price_source_check
  CHECK (price_source IS NULL OR price_source IN ('receipt_line', 'mrp', 'order_total', 'unknown'));

CREATE INDEX IF NOT EXISTS inventory_items_ai_interaction_idx
  ON public.inventory_items(ai_interaction_id)
  WHERE ai_interaction_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Part 3: shopping_items — additive columns. Voice→shopping is the only
-- AI-mediated path here; no brand/expiry/price extraction happens.
-- ----------------------------------------------------------------------------

ALTER TABLE public.shopping_items
  ADD COLUMN ai_interaction_id uuid REFERENCES public.ai_interactions(id) ON DELETE SET NULL,
  ADD COLUMN name_raw text,                           -- literal transcript substring
  ADD COLUMN quantity_raw text,                       -- literal quantity phrase as spoken
  ADD COLUMN extracted_extras jsonb;                  -- future-proof

CREATE INDEX IF NOT EXISTS shopping_items_ai_interaction_idx
  ON public.shopping_items(ai_interaction_id)
  WHERE ai_interaction_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Part 4: Supabase Storage bucket for scan images.
--
-- Path scheme: {user_id}/{ai_interaction_id}/{index}.jpg
-- The first folder component (user_id) drives RLS.
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-scan-images', 'ai-scan-images', false)
ON CONFLICT (id) DO NOTHING;

-- Users can read their own images (path begins with their user_id).
DROP POLICY IF EXISTS "Users can read own scan images" ON storage.objects;
CREATE POLICY "Users can read own scan images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ai-scan-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users can insert their own images (route uses authed client).
DROP POLICY IF EXISTS "Users can upload own scan images" ON storage.objects;
CREATE POLICY "Users can upload own scan images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ai-scan-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own images (for GDPR/account-deletion flows later).
DROP POLICY IF EXISTS "Users can delete own scan images" ON storage.objects;
CREATE POLICY "Users can delete own scan images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ai-scan-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
