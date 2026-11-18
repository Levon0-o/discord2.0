/*
  Allow channel managers to read rows they are authorized to create.

  The existing channels_select_accessible policy calls can_view_channel(id).
  That SECURITY DEFINER function looks the channel up in public.channels.
  During INSERT ... RETURNING, the newly inserted row may not yet be visible
  to that lookup, causing the SELECT policy to reject the returned row even
  though the INSERT WITH CHECK policy passed.

  This additional policy evaluates authorization from the new row's
  server_id directly. It mirrors the manager bypass already present inside
  can_view_channel while preserving the existing visibility rules for
  ordinary members.
*/

DROP POLICY IF EXISTS "channels_select_managers_for_returning" ON public.channels;

CREATE POLICY "channels_select_managers_for_returning"
ON public.channels
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
  OR (
    public.server_rank(server_id) >= 1
    AND (
      public.server_rank(server_id) >= 3
      OR public.server_has_permission(server_id, 'manage_channels')
    )
  )
);
