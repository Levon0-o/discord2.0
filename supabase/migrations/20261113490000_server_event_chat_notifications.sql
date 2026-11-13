/*
# Event chat mentions and reply notifications

Notify event-chat users when they are explicitly mentioned by username.
Notify the author of a message when another attendee replies to it.
All notification writes happen in a trusted SECURITY DEFINER trigger.
*/

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

CREATE OR REPLACE FUNCTION public.create_server_event_chat_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_original_author uuid;
  v_sender_role text;
  v_member record;
  v_normalized_body text;
  v_mention_all boolean;
BEGIN
  IF NEW.body IS NULL THEN
    RETURN NEW;
  END IF;

  v_normalized_body := lower(NEW.body);

  -- Reply notification: only a message in the same event can be the parent.
  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT m.author_id
      INTO v_original_author
    FROM public.server_event_chat_messages m
    WHERE m.id = NEW.reply_to_id
      AND m.event_id = NEW.event_id;

    IF v_original_author IS NOT NULL AND v_original_author <> NEW.author_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
      VALUES (v_original_author, NEW.author_id, 'reply', NEW.id);
    END IF;
  END IF;

  IF length(v_normalized_body) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT sm.role::text
    INTO v_sender_role
  FROM public.server_events e
  JOIN public.server_members sm
    ON sm.server_id = e.server_id
   AND sm.user_id = NEW.author_id
  WHERE e.id = NEW.event_id;

  IF v_sender_role IS NULL THEN
    RETURN NEW;
  END IF;

  v_mention_all := v_normalized_body ~ '(^|[^[:alnum:]_])@everyone([^[:alnum:]_]|$)';

  -- @everyone is restricted to owners, admins and moderators.
  IF v_mention_all AND v_sender_role IN ('owner', 'admin', 'moderator') THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
    SELECT DISTINCT sm.user_id, NEW.author_id, 'mention', NEW.id
    FROM public.server_events e
    JOIN public.server_members sm ON sm.server_id = e.server_id
    WHERE e.id = NEW.event_id
      AND sm.user_id <> NEW.author_id;
    RETURN NEW;
  END IF;

  -- Explicit @username mentions only notify members of this event's server.
  FOR v_member IN
    SELECT DISTINCT sm.user_id, p.username
    FROM public.server_events e
    JOIN public.server_members sm ON sm.server_id = e.server_id
    JOIN public.profiles p ON p.id = sm.user_id
    WHERE e.id = NEW.event_id
      AND sm.user_id <> NEW.author_id
      AND p.username IS NOT NULL
  LOOP
    IF v_normalized_body ~ (
      '(^|[^[:alnum:]_])@' || lower(v_member.username) || '([^[:alnum:]_]|$)'
    ) THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id)
      VALUES (v_member.user_id, NEW.author_id, 'mention', NEW.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_after_server_event_chat_message
  ON public.server_event_chat_messages;
CREATE TRIGGER notifications_after_server_event_chat_message
AFTER INSERT ON public.server_event_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.create_server_event_chat_notifications();

REVOKE EXECUTE ON FUNCTION public.create_server_event_chat_notifications()
  FROM PUBLIC, anon, authenticated;
