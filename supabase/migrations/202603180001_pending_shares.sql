CREATE TABLE public.pending_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_data text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.pending_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pending shares"
  ON public.pending_shares
  FOR ALL
  USING (auth.uid() = user_id);
