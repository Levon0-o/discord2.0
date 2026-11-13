/*
# Per-member, per-channel permission overrides

NULL means inherit the existing server-role default. Explicit overrides are
enforced by RLS and Storage policies, not only by the client UI.
*/

CREATE TABLE IF NOT EXISTS public.channel_member_permissions (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view boolean,
  can_send_messages boolean,
  can_attach_files boolean,
  can_manage_messages boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.channel_member_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_member_permissions TO authenticated;

DROP POLICY IF EXISTS channel_member_permissions_select ON public.channel_member_permissions;
CREATE POLICY channel_member_permissions_select
ON public.channel_member_permissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_member_permissions.channel_id
      AND public.server_rank(c.server_id) >= 3
  )
);

DROP POLICY IF EXISTS channel_member_permissions_insert_admins ON public.channel_member_permissions;
CREATE POLICY channel_member_permissions_insert_admins
ON public.channel_member_permissions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_member_permissions.channel_id
      AND public.server_rank(c.server_id) >= 3
  )
  AND EXISTS (
    SELECT 1 FROM public.server_members sm
    JOIN public.channels c ON c.server_id = sm.server_id
    WHERE c.id = channel_member_permissions.channel_id
      AND sm.user_id = channel_member_permissions.user_id
  )
);

DROP POLICY IF EXISTS channel_member_permissions_update_admins ON public.channel_member_permissions;
CREATE POLICY channel_member_permissions_update_admins
ON public.channel_member_permissions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_member_permissions.channel_id
      AND public.server_rank(c.server_id) >= 3
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_member_permissions.channel_id
      AND public.server_rank(c.server_id) >= 3
  )
  AND EXISTS (
    SELECT 1 FROM public.server_members sm
    JOIN public.channels c ON c.server_id = sm.server_id
    WHERE c.id = channel_member_permissions.channel_id
      AND sm.user_id = channel_member_permissions.user_id
  )
);

DROP POLICY IF EXISTS channel_member_permissions_delete_admins ON public.channel_member_permissions;
CREATE POLICY channel_member_permissions_delete_admins
ON public.channel_member_permissions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_member_permissions.channel_id
      AND public.server_rank(c.server_id) >= 3
  )
);

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
          (NOT c.is_restricted OR public.server_rank(c.server_id) >= 2)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_channel_message(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_view_channel(p_channel_id)
    AND COALESCE(
      (
        SELECT cmp.can_send_messages
        FROM public.channel_member_permissions cmp
        WHERE cmp.channel_id = p_channel_id
          AND cmp.user_id = auth.uid()
      ),
      true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_attach_channel_files(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_send_channel_message(p_channel_id)
    AND COALESCE(
      (
        SELECT cmp.can_attach_files
        FROM public.channel_member_permissions cmp
        WHERE cmp.channel_id = p_channel_id
          AND cmp.user_id = auth.uid()
      ),
      true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_channel_messages(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_view_channel(p_channel_id)
    AND (
      public.can_moderate_channel(p_channel_id)
      OR COALESCE(
        (
          SELECT cmp.can_manage_messages
          FROM public.channel_member_permissions cmp
          WHERE cmp.channel_id = p_channel_id
            AND cmp.user_id = auth.uid()
        ),
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

DROP POLICY IF EXISTS messages_insert_own_accessible ON public.messages;
CREATE POLICY messages_insert_own_accessible ON public.messages FOR INSERT
TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
    OR (channel_id IS NOT NULL AND public.can_send_channel_message(channel_id))
  )
);

DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages FOR UPDATE
TO authenticated USING (
  author_id = auth.uid()
  AND (
    conversation_id IS NOT NULL
    OR (channel_id IS NOT NULL AND public.can_send_channel_message(channel_id))
  )
)
WITH CHECK (
  author_id = auth.uid()
  AND (
    conversation_id IS NOT NULL
    OR (channel_id IS NOT NULL AND public.can_send_channel_message(channel_id))
  )
);

DROP POLICY IF EXISTS messages_delete_author_or_channel_moderator ON public.messages;
CREATE POLICY messages_delete_author_or_channel_moderator ON public.messages FOR DELETE
TO authenticated USING (
  (author_id = auth.uid() AND (conversation_id IS NOT NULL OR public.can_view_channel(channel_id)))
  OR (channel_id IS NOT NULL AND public.can_manage_channel_messages(channel_id))
);

DROP POLICY IF EXISTS channel_attachments_upload_own_member_folder ON storage.objects;
CREATE POLICY channel_attachments_upload_own_member_folder
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'channel-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.can_attach_channel_files(((storage.foldername(name))[1])::uuid)
);

COMMENT ON TABLE public.channel_member_permissions IS
'Per-user channel permission overrides. NULL inherits the server-role default.';
