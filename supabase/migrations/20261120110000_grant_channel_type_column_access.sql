/*
  The channel_type and slowmode_seconds columns were added after the
  original channels table grants. Explicitly grant the column access used
  by channel creation and editing to authenticated users; row-level
  permissions continue to be enforced by the existing channels policies.
*/

GRANT INSERT (channel_type) ON public.channels TO authenticated;
GRANT UPDATE (channel_type, slowmode_seconds) ON public.channels TO authenticated;
