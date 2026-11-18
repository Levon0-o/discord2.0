/*
  Ensure server owners can manage channels directly.

  The owner_id check is authoritative and avoids depending on the owner-membership
  trigger having populated server_members before channel creation. Existing
  administrator and custom-role permission checks remain supported.
*/

DROP POLICY IF EXISTS "channels_insert_admins" ON public.channels;
CREATE POLICY "channels_insert_admins" ON public.channels
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
  OR public.server_rank(server_id) >= 3
  OR public.server_has_permission(server_id, 'manage_channels')
);

DROP POLICY IF EXISTS "channels_update_admins" ON public.channels;
CREATE POLICY "channels_update_admins" ON public.channels
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
  OR public.server_rank(server_id) >= 3
  OR public.server_has_permission(server_id, 'manage_channels')
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
  OR public.server_rank(server_id) >= 3
  OR public.server_has_permission(server_id, 'manage_channels')
);

DROP POLICY IF EXISTS "channels_delete_admins" ON public.channels;
CREATE POLICY "channels_delete_admins" ON public.channels
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
  OR public.server_rank(server_id) >= 3
  OR public.server_has_permission(server_id, 'manage_channels')
);
