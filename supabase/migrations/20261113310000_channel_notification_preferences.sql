/*
# Per-user channel notification preferences

Members can mute mention and reply notifications in individual channels.
A null muted_until means the mute remains active until manually disabled.
*/

CREATE TABLE IF NOT EXISTS public.channel_notification_preferences (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_muted boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.channel_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their channel notification preferences" ON public.channel_notification_preferences;
CREATE POLICY "Users can view their channel notification preferences"
ON public.channel_notification_preferences
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.can_view_channel(channel_id));

DROP POLICY IF EXISTS "Users can create their channel notification preferences" ON public.channel_notification_preferences;
CREATE POLICY "Users can create their channel notification preferences"
ON public.channel_notification_preferences
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_view_channel(channel_id));

DROP POLICY IF EXISTS "Users can update their channel notification preferences" ON public.channel_notification_preferences;
CREATE POLICY "Users can update their channel notification preferences"
ON public.channel_notification_preferences
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.can_view_channel(channel_id))
WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_view_channel(channel_id));

DROP POLICY IF EXISTS "Users can delete their channel notification preferences" ON public.channel_notification_preferences;
CREATE POLICY "Users can delete their channel notification preferences"
ON public.channel_notification_preferences
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.can_view_channel(channel_id));

REVOKE ALL ON public.channel_notification_preferences FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_notification_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.create_server_message_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  original_author uuid;
BEGIN
  IF NEW.channel_id IS NULL OR NEW.reply_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.author_id
    INTO original_author
  FROM public.messages m
  WHERE m.id = NEW.reply_to_id
    AND m.channel_id = NEW.channel_id;

  IF original_author IS NULL OR original_author = NEW.author_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.channel_notification_preferences p
    WHERE p.channel_id = NEW.channel_id
      AND p.user_id = original_author
      AND p.is_muted = true
      AND (p.muted_until IS NULL OR p.muted_until > now())
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
  VALUES (original_author, NEW.author_id, 'reply', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_after_server_message_reply ON public.messages;
CREATE TRIGGER notifications_after_server_message_reply
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.channel_id IS NOT NULL AND NEW.reply_to_id IS NOT NULL)
EXECUTE FUNCTION public.create_server_message_reply_notification();

REVOKE EXECUTE ON FUNCTION public.create_server_message_reply_notification()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_server_message_mention_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_member record;
  sender_role text;
  mention_all boolean;
  normalized_body text;
BEGIN
  IF NEW.channel_id IS NULL OR NEW.body IS NULL OR length(NEW.body) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT sm.role::text INTO sender_role
  FROM public.channels c
  JOIN public.server_members sm
    ON sm.server_id = c.server_id
   AND sm.user_id = NEW.author_id
  WHERE c.id = NEW.channel_id;

  IF sender_role IS NULL THEN
    RETURN NEW;
  END IF;

  normalized_body := lower(NEW.body);
  mention_all := normalized_body ~ '(^|[^[:alnum:]_])@everyone([^[:alnum:]_]|$)';

  IF mention_all AND sender_role IN ('owner', 'admin', 'moderator') THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
    SELECT sm.user_id, NEW.author_id, 'mention', NEW.id
    FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE c.id = NEW.channel_id
      AND sm.user_id <> NEW.author_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.channel_notification_preferences p
        WHERE p.channel_id = NEW.channel_id
          AND p.user_id = sm.user_id
          AND p.is_muted = true
          AND (p.muted_until IS NULL OR p.muted_until > now())
      );
    RETURN NEW;
  END IF;

  FOR target_member IN
    SELECT sm.user_id, p.username
    FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    JOIN public.profiles p ON p.id = sm.user_id
    WHERE c.id = NEW.channel_id
      AND sm.user_id <> NEW.author_id
  LOOP
    IF target_member.username IS NOT NULL
       AND normalized_body ~ ('(^|[^[:alnum:]_])@' || lower(target_member.username) || '([^[:alnum:]_]|$)')
       AND NOT EXISTS (
         SELECT 1
         FROM public.channel_notification_preferences pref
         WHERE pref.channel_id = NEW.channel_id
           AND pref.user_id = target_member.user_id
           AND pref.is_muted = true
           AND (pref.muted_until IS NULL OR pref.muted_until > now())
       ) THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
      VALUES (target_member.user_id, NEW.author_id, 'mention', NEW.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_after_server_message_mention ON public.messages;
CREATE TRIGGER notifications_after_server_message_mention
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.channel_id IS NOT NULL)
EXECUTE FUNCTION public.create_server_message_mention_notifications();

REVOKE EXECUTE ON FUNCTION public.create_server_message_mention_notifications()
  FROM PUBLIC, anon, authenticated;
