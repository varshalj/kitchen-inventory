-- Migration verification: ensure RLS and owner-only policies are in place
-- so cross-user reads/writes are blocked.

DO $$
DECLARE
  tbl text;
  policy_count int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['items', 'shopping_items', 'ai_interactions', 'user_ai_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'user_id'
    ) THEN
      RAISE EXCEPTION 'Table %.% must include user_id column', 'public', tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = tbl
        AND c.conname = format('%s_user_id_fkey', tbl)
    ) THEN
      RAISE EXCEPTION 'Missing FK constraint %.% -> auth.users(id)', 'public', tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND c.relrowsecurity = true
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on %.%', 'public', tbl;
    END IF;

    SELECT COUNT(*)
      INTO policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = tbl
      AND (
        (p.cmd = 'SELECT' AND p.qual = '(auth.uid() = user_id)') OR
        (p.cmd = 'INSERT' AND p.with_check = '(auth.uid() = user_id)') OR
        (p.cmd = 'UPDATE' AND p.qual = '(auth.uid() = user_id)' AND p.with_check = '(auth.uid() = user_id)') OR
        (p.cmd = 'DELETE' AND p.qual = '(auth.uid() = user_id)')
      );

    IF policy_count <> 4 THEN
      RAISE EXCEPTION 'Expected 4 owner-only policies on %.%, found %', 'public', tbl, policy_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'created_at'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND indexname = format('idx_%s_user_created_at_desc', tbl)
    ) THEN
      RAISE EXCEPTION 'Missing index % on %.%', format('idx_%s_user_created_at_desc', tbl), 'public', tbl;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'status'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND indexname = format('idx_%s_user_status', tbl)
    ) THEN
      RAISE EXCEPTION 'Missing index % on %.%', format('idx_%s_user_status', tbl), 'public', tbl;
    END IF;
  END LOOP;
END
$$;
