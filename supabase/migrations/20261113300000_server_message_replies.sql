/*
# Server message reply notifications

Notify the original author when another server member replies to their message.
Only same-channel replies are eligible; self-replies are ignored.
*/

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
