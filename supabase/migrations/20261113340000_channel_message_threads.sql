/*
# Channel message threads

Thread replies are stored in the existing messages table and excluded from
the main channel timeline. The root message remains in the main timeline.
*/

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS messages_thread_id_created_at_idx
  ON public.messages (thread_id, created_at, id)
  WHERE thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_channel_message_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_channel uuid;
  v_parent_thread uuid;
BEGIN
  IF NEW.thread_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.channel_id IS NULL OR NEW.thread_id = NEW.id THEN
    RAISE EXCEPTION 'Thread replies must belong to a channel and reference a different message.';
  END IF;

  SELECT m.channel_id, m.thread_id
    INTO v_parent_channel, v_parent_thread
  FROM public.messages m
  WHERE m.id = NEW.thread_id;

  IF NOT FOUND OR v_parent_channel IS DISTINCT FROM NEW.channel_id OR v_parent_thread IS NOT NULL THEN
    RAISE EXCEPTION 'Thread root must be a message in the same channel and cannot itself be a thread reply.';
  END IF;

  -- Keep reply notifications and reply previews connected to the root message.
  NEW.reply_to_id := NEW.thread_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_channel_message_thread()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_channel_message_thread_before_write ON public.messages;
CREATE TRIGGER validate_channel_message_thread_before_write
BEFORE INSERT OR UPDATE OF thread_id, channel_id ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.validate_channel_message_thread();

COMMENT ON COLUMN public.messages.thread_id IS
'Root message ID for a channel thread reply; null for normal channel messages and DMs.';
