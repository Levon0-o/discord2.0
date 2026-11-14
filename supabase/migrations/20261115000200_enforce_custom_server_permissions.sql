/*
  Enforce custom server permissions in database policies.
  Role-definition changes remain restricted to fixed admins/owners to prevent
  a custom role manager from granting itself higher privileges.
*/

CREATE OR REPLACE FUNCTION public.server_has_permission(
  p_server_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.server_rank(p_server_id) >= 3
    OR (
      p_permission IN (
        'manage_server',
        'manage_channels',
        'manage_members',
        'manage_invites',
        'manage_roles',
        'moderate_messages',
        'manage_messages',
        'view_restricted_channels'
      )
      AND EXISTS (
        SELECT 1
        FROM public.member_roles mr
        JOIN public.custom_roles cr
          ON cr.id = mr.role_id
         AND cr.server_id = mr.server_id
        WHERE mr.server_id = p_server_id
          AND mr.user_id = auth.uid()
          AND cr.permissions ->> p_permission = 'true'
      )
    )
    OR (
      p_permission IN ('manage_invites', 'moderate_messages')
      AND public.server_rank(p_server_id) >= 2
    );
$$;

REVOKE EXECUTE ON FUNCTION public.server_has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_has_permission(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = p_channel_id
      AND public.server_rank(c.server_id) >= 1
      AND (
        public.server_rank(c.server_id) >= 3
        OR COALESCE(
          (
            SELECT cmp.can_view
            FROM public.channel_member_permissions cmp
            WHERE cmp.channel_id = c.id
              AND cmp.user_id = auth.uid()
          ),
          (
            NOT c.is_restricted
            OR public.server_rank(c.server_id) >= 2
            OR public.server_has_permission(c.server_id, 'view_restricted_channels')
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = p_channel_id
      AND public.server_rank(c.server_id) >= 1
      AND (
        public.server_rank(c.server_id) >= 2
        OR public.server_has_permission(c.server_id, 'moderate_messages')
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_moderate_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_channel(uuid) TO authenticated;

DROP POLICY IF EXISTS "servers_update_admins" ON public.servers;
CREATE POLICY "servers_update_admins" ON public.servers FOR UPDATE
TO authenticated
USING (public.server_has_permission(id, 'manage_server'))
WITH CHECK (public.server_has_permission(id, 'manage_server'));

DROP POLICY IF EXISTS "channels_insert_admins" ON public.channels;
CREATE POLICY "channels_insert_admins" ON public.channels FOR INSERT
TO authenticated
WITH CHECK (public.server_has_permission(server_id, 'manage_channels'));

DROP POLICY IF EXISTS "channels_update_admins" ON public.channels;
CREATE POLICY "channels_update_admins" ON public.channels FOR UPDATE
TO authenticated
USING (public.server_has_permission(server_id, 'manage_channels'))
WITH CHECK (public.server_has_permission(server_id, 'manage_channels'));

DROP POLICY IF EXISTS "channels_delete_admins" ON public.channels;
CREATE POLICY "channels_delete_admins" ON public.channels FOR DELETE
TO authenticated
USING (public.server_has_permission(server_id, 'manage_channels'));

DROP POLICY IF EXISTS "invitations_insert_moderators" ON public.invitations;
CREATE POLICY "invitations_insert_moderators" ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.server_has_permission(server_id, 'manage_invites')
);

DROP POLICY IF EXISTS "invitations_update_moderators" ON public.invitations;
CREATE POLICY "invitations_update_moderators" ON public.invitations FOR UPDATE
TO authenticated
USING (public.server_has_permission(server_id, 'manage_invites'))
WITH CHECK (public.server_has_permission(server_id, 'manage_invites'));

DROP POLICY IF EXISTS "invitations_delete_moderators" ON public.invitations;
CREATE POLICY "invitations_delete_moderators" ON public.invitations FOR DELETE
TO authenticated
USING (public.server_has_permission(server_id, 'manage_invites'));

COMMENT ON FUNCTION public.server_has_permission(uuid, text) IS
'Checks fixed administrator permissions and assigned custom-role permission flags. Custom role definitions themselves remain fixed-admin managed.';
