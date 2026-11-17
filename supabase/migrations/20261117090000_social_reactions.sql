-- Reactions for social posts, comments and replies.
CREATE TABLE IF NOT EXISTS public.social_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('post', 'comment')),
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🎉')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS social_reactions_entity_idx
  ON public.social_reactions (entity_type, entity_id, created_at);

ALTER TABLE public.social_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reactions REPLICA IDENTITY FULL;
GRANT SELECT ON public.social_reactions TO authenticated;
GRANT INSERT (entity_type, entity_id, user_id, emoji) ON public.social_reactions TO authenticated;
GRANT DELETE ON public.social_reactions TO authenticated;

DROP POLICY IF EXISTS "social_reactions_select_visible" ON public.social_reactions;
CREATE POLICY "social_reactions_select_visible" ON public.social_reactions
FOR SELECT TO authenticated USING (
  (entity_type = 'post' AND EXISTS (
    SELECT 1 FROM public.posts p WHERE p.id = social_reactions.entity_id
  ))
  OR
  (entity_type = 'comment' AND EXISTS (
    SELECT 1 FROM public.comments c
    JOIN public.posts p ON p.id = c.post_id
    WHERE c.id = social_reactions.entity_id
  ))
);

DROP POLICY IF EXISTS "social_reactions_insert_own_visible" ON public.social_reactions;
CREATE POLICY "social_reactions_insert_own_visible" ON public.social_reactions
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    (entity_type = 'post' AND EXISTS (
      SELECT 1 FROM public.posts p WHERE p.id = social_reactions.entity_id
    ))
    OR
    (entity_type = 'comment' AND EXISTS (
      SELECT 1 FROM public.comments c
      JOIN public.posts p ON p.id = c.post_id
      WHERE c.id = social_reactions.entity_id
    ))
  )
);

DROP POLICY IF EXISTS "social_reactions_delete_own" ON public.social_reactions;
CREATE POLICY "social_reactions_delete_own" ON public.social_reactions
FOR DELETE TO authenticated USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'social_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_reactions;
  END IF;
END;
$$;
