/*
  AFTERDARK notifications for follows, likes and comments.
  Rows are created by trusted database triggers, never by client inserts.
*/

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('follow', 'like', 'comment')),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_not_self CHECK (recipient_id <> actor_id)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_author uuid;
BEGIN
  SELECT p.author_id INTO target_author
  FROM public.posts p WHERE p.id = NEW.post_id;

  IF target_author IS NOT NULL AND target_author <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
    VALUES (target_author, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_comment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_author uuid;
BEGIN
  SELECT p.author_id INTO target_author
  FROM public.posts p WHERE p.id = NEW.post_id;

  IF target_author IS NOT NULL AND target_author <> NEW.author_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
    VALUES (target_author, NEW.author_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.follower_id <> NEW.following_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.following_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_after_like ON public.likes;
CREATE TRIGGER notifications_after_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_like_notification();

DROP TRIGGER IF EXISTS notifications_after_comment ON public.comments;
CREATE TRIGGER notifications_after_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_comment_notification();

DROP TRIGGER IF EXISTS notifications_after_follow ON public.follows;
CREATE TRIGGER notifications_after_follow
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.create_follow_notification();

REVOKE EXECUTE ON FUNCTION public.create_like_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_comment_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_follow_notification() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
