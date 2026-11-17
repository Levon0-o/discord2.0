/*
  Category-level per-member overrides.
  Precedence: channel override > category override > server default.
*/
CREATE TABLE IF NOT EXISTS public.category_member_permissions (
  category_id uuid NOT NULL REFERENCES public.server_channel_categories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view boolean,
  can_send_messages boolean,
  can_attach_files boolean,
  can_manage_messages boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, user_id)
);
ALTER TABLE public.category_member_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_member_permissions TO authenticated;

DROP POLICY IF EXISTS category_member_permissions_select ON public.category_member_permissions;
CREATE POLICY category_member_permissions_select ON public.category_member_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.server_channel_categories cat
  WHERE cat.id = category_member_permissions.category_id AND public.server_rank(cat.server_id) >= 3
));
DROP POLICY IF EXISTS category_member_permissions_insert_admins ON public.category_member_permissions;
CREATE POLICY category_member_permissions_insert_admins ON public.category_member_permissions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.server_channel_categories cat WHERE cat.id = category_member_permissions.category_id AND public.server_rank(cat.server_id) >= 3)
  AND EXISTS (
    SELECT 1 FROM public.server_channel_categories cat
    JOIN public.server_members sm ON sm.server_id = cat.server_id
    WHERE cat.id = category_member_permissions.category_id AND sm.user_id = category_member_permissions.user_id
  )
);
DROP POLICY IF EXISTS category_member_permissions_update_admins ON public.category_member_permissions;
CREATE POLICY category_member_permissions_update_admins ON public.category_member_permissions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.server_channel_categories cat WHERE cat.id = category_member_permissions.category_id AND public.server_rank(cat.server_id) >= 3))
WITH CHECK (
  EXISTS (SELECT 1 FROM public.server_channel_categories cat WHERE cat.id = category_member_permissions.category_id AND public.server_rank(cat.server_id) >= 3)
  AND EXISTS (
    SELECT 1 FROM public.server_channel_categories cat
    JOIN public.server_members sm ON sm.server_id = cat.server_id
    WHERE cat.id = category_member_permissions.category_id AND sm.user_id = category_member_permissions.user_id
  )
);
DROP POLICY IF EXISTS category_member_permissions_delete_admins ON public.category_member_permissions;
CREATE POLICY category_member_permissions_delete_admins ON public.category_member_permissions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.server_channel_categories cat WHERE cat.id = category_member_permissions.category_id AND public.server_rank(cat.server_id) >= 3));

CREATE OR REPLACE FUNCTION public.can_view_channel(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = p_channel_id AND public.server_rank(c.server_id) >= 1
      AND (
        public.server_rank(c.server_id) >= 3
        OR COALESCE(
          (SELECT cmp.can_view FROM public.channel_member_permissions cmp WHERE cmp.channel_id = c.id AND cmp.user_id = auth.uid()),
          (SELECT cmp.can_view FROM public.category_member_permissions cmp JOIN public.server_channel_categories cat ON cat.id = cmp.category_id WHERE cat.server_id = c.server_id AND cat.name = c.category AND cmp.user_id = auth.uid()),
          (NOT c.is_restricted OR public.server_rank(c.server_id) >= 2)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_channel_message(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_view_channel(p_channel_id) AND COALESCE(
    (SELECT cmp.can_send_messages FROM public.channel_member_permissions cmp WHERE cmp.channel_id = p_channel_id AND cmp.user_id = auth.uid()),
    (SELECT cmp.can_send_messages FROM public.category_member_permissions cmp JOIN public.channels c ON c.server_id = cat.server_id AND c.category = cat.name JOIN public.server_channel_categories cat ON cat.id = cmp.category_id WHERE c.id = p_channel_id AND cmp.user_id = auth.uid()),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_attach_channel_files(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_send_channel_message(p_channel_id) AND COALESCE(
    (SELECT cmp.can_attach_files FROM public.channel_member_permissions cmp WHERE cmp.channel_id = p_channel_id AND cmp.user_id = auth.uid()),
    (SELECT cmp.can_attach_files FROM public.category_member_permissions cmp JOIN public.channels c ON c.server_id = cat.server_id AND c.category = cat.name JOIN public.server_channel_categories cat ON cat.id = cmp.category_id WHERE c.id = p_channel_id AND cmp.user_id = auth.uid()),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_channel_messages(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_view_channel(p_channel_id) AND (
    public.can_moderate_channel(p_channel_id)
    OR COALESCE(
      (SELECT cmp.can_manage_messages FROM public.channel_member_permissions cmp WHERE cmp.channel_id = p_channel_id AND cmp.user_id = auth.uid()),
      (SELECT cmp.can_manage_messages FROM public.category_member_permissions cmp JOIN public.channels c ON c.server_id = cat.server_id AND c.category = cat.name JOIN public.server_channel_categories cat ON cat.id = cmp.category_id WHERE c.id = p_channel_id AND cmp.user_id = auth.uid()),
      false
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_send_channel_message(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_attach_channel_files(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_channel_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_channel_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_attach_channel_files(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_channel_messages(uuid) TO authenticated;
