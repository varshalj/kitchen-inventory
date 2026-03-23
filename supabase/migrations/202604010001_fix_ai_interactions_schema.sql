-- The ai_interactions table was previously created with incorrect columns
-- (feature_type, input_summary, structured_output). Drop and recreate with the
-- schema that matches the application code in lib/server/ai-store.ts.

DROP TABLE IF EXISTS public.ai_interactions CASCADE;

CREATE TABLE public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_input text NOT NULL,
  model_raw_response jsonb,
  parsed_response jsonb,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai_interactions"
  ON public.ai_interactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert ai_interactions"
  ON public.ai_interactions FOR INSERT WITH CHECK (true);

CREATE INDEX ON public.ai_interactions (user_id, created_at DESC);
