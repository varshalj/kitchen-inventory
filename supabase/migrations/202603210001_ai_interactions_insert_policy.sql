CREATE POLICY "Service role can insert ai_interactions"
  ON public.ai_interactions FOR INSERT
  WITH CHECK (true);
