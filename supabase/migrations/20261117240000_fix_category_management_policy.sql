-- Keep category management consistent with the server's manage_channels permission.
DROP POLICY IF EXISTS server_channel_categories_update_admins ON public.server_channel_categories;
CREATE POLICY server_channel_categories_update_admins
ON public.server_channel_categories FOR UPDATE TO authenticated
USING (public.server_has_permission(server_id, 'manage_channels'))
WITH CHECK (public.server_has_permission(server_id, 'manage_channels'));
