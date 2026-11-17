/*
  Category-level custom-role overrides.
  Effective precedence: channel member > channel role > category member >
  category role > server defaults. Explicit Deny wins across assigned roles.
*/
CREATE TABLE IF NOT EXISTS public.category_role_permissions (
  category_id uuid NOT NULL REFERENCES public.server_channel_categories(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  can_view boolean,
  can_send_messages boolean,
  can_attach_files boolean,
  can_manage_messages boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, role_id),
  CONSTRAINT category_role_permissions_role_server_fk
    FOREIGN KEY (role_id, server_id) REFERENCES public.custom_roles(id, server_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS category_role_permissions_role_idx
  ON public.category_role_permissions(role_id, category_id);
ALTER TABLE public.category_role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_role_permissions TO authenticated;

DROP POLICY IF EXISTS category_role_permissions_select ON public.category_role_permissions;
CREATE POLICY category_role_permissions_select ON public.category_role_permissions
  FOR SELECT TO authenticated
  USING (public.server_has_permission(server_id, 'manage_channels'));
DROP POLICY IF EXISTS category_role_permissions_insert ON public.category_role_permissions;
CREATE POLICY category_role_permissions_insert ON public.category_role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.server_has_permission(server_id, 'manage_channels')
    AND EXISTS (SELECT 1 FROM public.server_channel_categories cat
      WHERE cat.id = category_role_permissions.category_id AND cat.server_id = category_role_permissions.server_id)
  );
DROP POLICY IF EXISTS category_role_permissions_update ON public.category_role_permissions;
CREATE POLICY category_role_permissions_update ON public.category_role_permissions
  FOR UPDATE TO authenticated
  USING (public.server_has_permission(server_id, 'manage_channels'))
  WITH CHECK (
    public.server_has_permission(server_id, 'manage_channels')
    AND EXISTS (SELECT 1 FROM public.server_channel_categories cat
      WHERE cat.id = category_role_permissions.category_id AND cat.server_id = category_role_permissions.server_id)
  );
DROP POLICY IF EXISTS category_role_permissions_delete ON public.category_role_permissions;
CREATE POLICY category_role_permissions_delete ON public.category_role_permissions
  FOR DELETE TO authenticated
  USING (public.server_has_permission(server_id, 'manage_channels'));

CREATE OR REPLACE FUNCTION public.category_role_permission(p_channel_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.channels c
      JOIN public.server_channel_categories cat ON cat.server_id = c.server_id AND cat.name = c.category
      JOIN public.category_role_permissions p ON p.category_id = cat.id
      JOIN public.member_roles mr ON mr.role_id = p.role_id AND mr.server_id = p.server_id
      WHERE c.id = p_channel_id AND mr.user_id = auth.uid()
        AND CASE p_permission
          WHEN 'can_view' THEN p.can_view
          WHEN 'can_send_messages' THEN p.can_send_messages
          WHEN 'can_attach_files' THEN p.can_attach_files
          WHEN 'can_manage_messages' THEN p.can_manage_messages
          ELSE NULL
        END IS FALSE
    ) THEN FALSE
    WHEN EXISTS (
      SELECT 1 FROM public.channels c
      JOIN public.server_channel_categories cat ON cat.server_id = c.server_id AND cat.name = c.category
      JOIN public.category_role_permissions p ON p.category_id = cat.id
      JOIN public.member_roles mr ON mr.role_id = p.role_id AND mr.server_id = p.server_id
      WHERE c.id = p_channel_id AND mr.user_id = auth.uid()
        AND CASE p_permission
          WHEN 'can_view' THEN p.can_view
          WHEN 'can_send_messages' THEN p.can_send_messages
          WHEN 'can_attach_files' THEN p.can_attach_files
          WHEN 'can_manage_messages' THEN p.can_manage_messages
          ELSE NULL
        END IS TRUE
    ) THEN TRUE
    ELSE NULL
  END;
$$;

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
    public.category_role_permission(c.id, 'can_view'),
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
  public.category_role_permission(p_channel_id, 'can_send_messages'),
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
  public.category_role_permission(p_channel_id, 'can_attach_files'),
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
   public.category_role_permission(p_channel_id, 'can_manage_messages'),
   FALSE
  )
 );
$$;

REVOKE EXECUTE ON FUNCTION public.category_role_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.category_role_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_channel_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_attach_channel_files(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_channel_messages(uuid) TO authenticated;

COMMENT ON TABLE public.category_role_permissions IS 'Per-custom-role category overrides. Explicit Deny wins across assigned roles.';
