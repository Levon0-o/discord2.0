/*
  Make channel creation authorization explicit and reliable.
  A server owner may always create channels, even if the owner-membership
  trigger was missed. Administrators and members with manage_channels retain
  access through the existing permission helper.
*/

CREATE OR REPLACE FUNCTION public.can_manage_server_channels(p_server_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = p_server_id
      AND s.owner_id = auth.uid()
  )
  OR public.server_has_permission(p_server_id, 'manage_channels');
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_server_channels(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_server_channels(uuid)
  TO authenticated;

DROP POLICY IF EXISTS channels_insert_admins ON public.channels;
CREATE POLICY channels_insert_admins
ON public.channels
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_server_channels(server_id));

COMMENT ON FUNCTION public.can_manage_server_channels(uuid) IS
'Allows the server owner or a user with the manage_channels permission to create server channels.';
