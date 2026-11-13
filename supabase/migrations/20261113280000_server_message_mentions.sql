/*
# Server message mentions

Create notifications for explicit @username mentions and permission-gated
@everyone mentions. Notification rows are written only by this trusted trigger.
*/

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

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
      AND sm.user_id <> NEW.author_id;
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
       AND normalized_body ~ ('(^|[^[:alnum:]_])@' || lower(target_member.username) || '([^[:alnum:]_]|$)') THEN
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
