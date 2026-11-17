/*
 Role-based channel permissions. Precedence:
 channel member > channel role > category member > server default.
 Deny wins if a member has multiple assigned roles.
*/
CREATE TABLE IF NOT EXISTS public.channel_role_permissions (
 channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
 server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
 role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
 can_view boolean, can_send_messages boolean, can_attach_files boolean, can_manage_messages boolean,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (channel_id, role_id),
 CONSTRAINT channel_role_permissions_role_server_fk FOREIGN KEY (role_id, server_id)
   REFERENCES public.custom_roles(id, server_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS channel_role_permissions_role_idx ON public.channel_role_permissions(role_id, channel_id);
ALTER TABLE public.channel_role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_role_permissions TO authenticated;

DROP POLICY IF EXISTS channel_role_permissions_select ON public.channel_role_permissions;
CREATE POLICY channel_role_permissions_select ON public.channel_role_permissions FOR SELECT TO authenticated
 USING (public.server_has_permission(server_id, 'manage_channels'));
DROP POLICY IF EXISTS channel_role_permissions_insert ON public.channel_role_permissions;
CREATE POLICY channel_role_permissions_insert ON public.channel_role_permissions FOR INSERT TO authenticated
 WITH CHECK (public.server_has_permission(server_id, 'manage_channels') AND EXISTS (
   SELECT 1 FROM public.channels c WHERE c.id = channel_role_permissions.channel_id AND c.server_id = channel_role_permissions.server_id
 ));
DROP POLICY IF EXISTS channel_role_permissions_update ON public.channel_role_permissions;
CREATE POLICY channel_role_permissions_update ON public.channel_role_permissions FOR UPDATE TO authenticated
 USING (public.server_has_permission(server_id, 'manage_channels'))
 WITH CHECK (public.server_has_permission(server_id, 'manage_channels') AND EXISTS (
   SELECT 1 FROM public.channels c WHERE c.id = channel_role_permissions.channel_id AND c.server_id = channel_role_permissions.server_id
 ));
DROP POLICY IF EXISTS channel_role_permissions_delete ON public.channel_role_permissions;
CREATE POLICY channel_role_permissions_delete ON public.channel_role_permissions FOR DELETE TO authenticated
 USING (public.server_has_permission(server_id, 'manage_channels'));

CREATE OR REPLACE FUNCTION public.can_view_channel(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.channels c
  WHERE c.id = p_channel_id AND public.server_rank(c.server_id) >= 1
  AND (
   public.server_rank(c.server_id) >= 3 OR public.server_has_permission(c.server_id, 'manage_channels')
   OR COALESCE(
    (SELECT p.can_view FROM public.channel_member_permissions p WHERE p.channel_id=c.id AND p.user_id=auth.uid()),
    CASE
     WHEN EXISTS (SELECT 1 FROM public.channel_role_permissions p JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE p.channel_id=c.id AND mr.user_id=auth.uid() AND p.can_view IS FALSE) THEN FALSE
     WHEN EXISTS (SELECT 1 FROM public.channel_role_permissions p JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE p.channel_id=c.id AND mr.user_id=auth.uid() AND p.can_view IS TRUE) THEN TRUE
     ELSE NULL
    END,
    (SELECT p.can_view FROM public.category_member_permissions p JOIN public.server_channel_categories cat ON cat.id=p.category_id WHERE cat.server_id=c.server_id AND cat.name=c.category AND p.user_id=auth.uid()),
    (NOT c.is_restricted OR public.server_rank(c.server_id)>=2 OR public.server_has_permission(c.server_id,'view_restricted_channels'))
   )
  )
 );
$$;

CREATE OR REPLACE FUNCTION public.can_send_channel_message(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_view_channel(p_channel_id) AND COALESCE(
  (SELECT p.can_send_messages FROM public.channel_member_permissions p WHERE p.channel_id=p_channel_id AND p.user_id=auth.uid()),
  CASE
   WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_send_messages IS FALSE) THEN FALSE
   WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_send_messages IS TRUE) THEN TRUE
   ELSE NULL
  END,
  (SELECT p.can_send_messages FROM public.category_member_permissions p JOIN public.server_channel_categories cat ON cat.id=p.category_id JOIN public.channels c ON c.server_id=cat.server_id AND c.category=cat.name WHERE c.id=p_channel_id AND p.user_id=auth.uid()),
  TRUE
 );
$$;

CREATE OR REPLACE FUNCTION public.can_attach_channel_files(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_send_channel_message(p_channel_id) AND COALESCE(
  (SELECT p.can_attach_files FROM public.channel_member_permissions p WHERE p.channel_id=p_channel_id AND p.user_id=auth.uid()),
  CASE
   WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_attach_files IS FALSE) THEN FALSE
   WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_attach_files IS TRUE) THEN TRUE
   ELSE NULL
  END,
  (SELECT p.can_attach_files FROM public.category_member_permissions p JOIN public.server_channel_categories cat ON cat.id=p.category_id JOIN public.channels c ON c.server_id=cat.server_id AND c.category=cat.name WHERE c.id=p_channel_id AND p.user_id=auth.uid()),
  TRUE
 );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_channel_messages(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_view_channel(p_channel_id) AND (
  public.can_moderate_channel(p_channel_id) OR COALESCE(
   (SELECT p.can_manage_messages FROM public.channel_member_permissions p WHERE p.channel_id=p_channel_id AND p.user_id=auth.uid()),
   CASE
    WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_manage_messages IS FALSE) THEN FALSE
    WHEN EXISTS (SELECT 1 FROM public.channels c JOIN public.channel_role_permissions p ON p.channel_id=c.id JOIN public.member_roles mr ON mr.role_id=p.role_id AND mr.server_id=p.server_id WHERE c.id=p_channel_id AND mr.user_id=auth.uid() AND p.can_manage_messages IS TRUE) THEN TRUE
    ELSE NULL
   END,
   (SELECT p.can_manage_messages FROM public.category_member_permissions p JOIN public.server_channel_categories cat ON cat.id=p.category_id JOIN public.channels c ON c.server_id=cat.server_id AND c.category=cat.name WHERE c.id=p_channel_id AND p.user_id=auth.uid()),
   FALSE
  )
 );
$$;

DROP POLICY IF EXISTS "channels_select_accessible" ON public.channels;
CREATE POLICY "channels_select_accessible" ON public.channels FOR SELECT TO authenticated
 USING (public.can_view_channel(id));

CREATE OR REPLACE FUNCTION public.get_visible_channel_ids(p_server_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT c.id FROM public.channels c WHERE c.server_id=p_server_id AND public.can_view_channel(c.id)
 ORDER BY c.position, c.name;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_send_channel_message(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_attach_channel_files(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_channel_messages(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_visible_channel_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_channel_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_attach_channel_files(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_channel_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_channel_ids(uuid) TO authenticated;

COMMENT ON TABLE public.channel_role_permissions IS 'Per-custom-role channel overrides. Explicit Deny wins across assigned roles.';
