-- Add email forwarding token to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_forwarding_token text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_email_token
  ON public.user_settings (email_forwarding_token)
  WHERE email_forwarding_token IS NOT NULL;

-- Create email_ingestions table
CREATE TABLE IF NOT EXISTS public.email_ingestions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text,
  order_id text,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'saved', 'failed', 'dismissed', 'skipped')),
  error_message text,
  sender_email text,
  subject text,
  parsed_items jsonb,
  item_count integer DEFAULT 0,
  order_total text,
  order_date timestamptz,
  confidence numeric(3,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_ingestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_ingestions_select_own" ON public.email_ingestions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "email_ingestions_update_own" ON public.email_ingestions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "service_role_manage_email_ingestions" ON public.email_ingestions
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_email_ingestions_user_status
  ON public.email_ingestions (user_id, status);
CREATE INDEX idx_email_ingestions_dedup
  ON public.email_ingestions (user_id, order_id)
  WHERE order_id IS NOT NULL;
