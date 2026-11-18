/*
  Enable voice as a valid server channel type immediately.
  Keep channel row-level security unchanged; only extend the type constraint
  and grant the existing authenticated channel managers access to the
  channel_type and slowmode_seconds columns.
*/

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_channel_type_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_channel_type_check
  CHECK (channel_type IN ('text', 'announcement', 'voice'));

GRANT INSERT (channel_type) ON public.channels TO authenticated;
GRANT UPDATE (channel_type, slowmode_seconds) ON public.channels TO authenticated;
