/*
  Enable realtime updates for conversation read timestamps.
  Read receipts reuse conversation_members.last_read_at and existing RLS.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.conversation_members;
  END IF;
END
$$;
