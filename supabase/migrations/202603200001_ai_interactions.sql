CREATE TABLE IF NOT EXISTS public.ai_interactions (
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
  ON public.ai_interactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_interactions_user_created_idx
  ON public.ai_interactions (user_id, created_at DESC);
