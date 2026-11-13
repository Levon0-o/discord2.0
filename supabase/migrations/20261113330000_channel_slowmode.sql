/*
# Per-channel slowmode

Admins and moderators bypass slowmode. Regular members must wait the
configured number of seconds between messages in the same channel.
*/

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS slowmode_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_slowmode_seconds_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_slowmode_seconds_check
  CHECK (slowmode_seconds >= 0 AND slowmode_seconds <= 3600);

CREATE OR REPLACE FUNCTION public.enforce_channel_slowmode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_server_id uuid;
  v_slowmode integer;
  v_last_message_at timestamptz;
  v_now timestamptz := COALESCE(NEW.created_at, now());
BEGIN
  IF NEW.channel_id IS NULL OR v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.server_id, c.slowmode_seconds
    INTO v_server_id, v_slowmode
  FROM public.channels c
  WHERE c.id = NEW.channel_id;

  IF NOT FOUND OR COALESCE(v_slowmode, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent sends from the same member in this channel.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.channel_id::text || ':' || v_user_id::text, 0)
  );

  -- Moderators, administrators and the owner bypass slowmode.
  IF public.server_rank(v_server_id) >= 2 THEN
    RETURN NEW;
  END IF;

  SELECT max(m.created_at)
    INTO v_last_message_at
  FROM public.messages m
  WHERE m.channel_id = NEW.channel_id
    AND m.author_id = v_user_id;

  IF v_last_message_at IS NOT NULL
     AND v_now < v_last_message_at + make_interval(secs => v_slowmode) THEN
    RAISE EXCEPTION 'Slowmode is enabled. Please wait before sending another message.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_channel_slowmode() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_channel_slowmode_before_insert ON public.messages;
CREATE TRIGGER enforce_channel_slowmode_before_insert
BEFORE INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.channel_id IS NOT NULL)
EXECUTE FUNCTION public.enforce_channel_slowmode();

COMMENT ON COLUMN public.channels.slowmode_seconds IS
'Minimum seconds between messages from a regular member in this channel. Zero disables slowmode.';
