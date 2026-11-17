/*
  First-class channel types for AFTERDARK.
  Existing channels remain text channels; announcement channels reuse
  the existing channel_announcements publishing and rendering system.
*/
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS channel_type text;

UPDATE public.channels
SET channel_type = 'text'
WHERE channel_type IS NULL OR channel_type NOT IN ('text', 'announcement');

ALTER TABLE public.channels
  ALTER COLUMN channel_type SET DEFAULT 'text',
  ALTER COLUMN channel_type SET NOT NULL;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_channel_type_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_channel_type_check
  CHECK (channel_type IN ('text', 'announcement'));

COMMENT ON COLUMN public.channels.channel_type IS
  'Channel presentation and publishing mode: text or announcement.';
