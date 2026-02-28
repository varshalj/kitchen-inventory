-- Add user ownership to user-scoped tables, enable RLS, and optimize user-scoped queries.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['items', 'shopping_items', 'ai_interactions', 'user_ai_settings'] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS user_id uuid', tbl);

    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = tbl
        AND c.conname = format('%s_user_id_fkey', tbl)
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        tbl,
        format('%s_user_id_fkey', tbl)
      );
    END IF;

    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', format('%s_select_own', tbl), tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', format('%s_insert_own', tbl), tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', format('%s_update_own', tbl), tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', format('%s_delete_own', tbl), tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)',
      format('%s_select_own', tbl),
      tbl
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)',
      format('%s_insert_own', tbl),
      tbl
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      format('%s_update_own', tbl),
      tbl
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)',
      format('%s_delete_own', tbl),
      tbl
    );

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'created_at'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, created_at DESC)',
        format('idx_%s_user_created_at_desc', tbl),
        tbl
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'status'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, status)',
        format('idx_%s_user_status', tbl),
        tbl
      );
    END IF;
  END LOOP;
END
$$;
