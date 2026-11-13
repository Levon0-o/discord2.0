/*
# Event chat read receipts

Tracks the last time each attendee viewed an event chat.
Attendees can read receipts only for events in servers they belong to.
*/

CREATE TABLE IF NOT EXISTS public.server_event_chat_reads (
  event_id uuid NOT NULL REFERENCES public.server_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS server_event_chat_reads_event_last_read_idx
  ON public.server_event_chat_reads (event_id, last_read_at DESC);

ALTER TABLE public.server_event_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event chat reads visible to event server members"
  ON public.server_event_chat_reads;
CREATE POLICY "Event chat reads visible to event server members"
  ON public.server_event_chat_reads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.server_events e
      JOIN public.server_members sm ON sm.server_id = e.server_id
      WHERE e.id = server_event_chat_reads.event_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own event chat read receipt"
  ON public.server_event_chat_reads;
CREATE POLICY "Users update own event chat read receipt"
  ON public.server_event_chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.server_events e
      JOIN public.server_members sm ON sm.server_id = e.server_id
      WHERE e.id = server_event_chat_reads.event_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users refresh own event chat read receipt"
  ON public.server_event_chat_reads;
CREATE POLICY "Users refresh own event chat read receipt"
  ON public.server_event_chat_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.server_events e
      JOIN public.server_members sm ON sm.server_id = e.server_id
      WHERE e.id = server_event_chat_reads.event_id
        AND sm.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.server_event_chat_reads TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'server_event_chat_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.server_event_chat_reads;
  END IF;
END;
$$;
