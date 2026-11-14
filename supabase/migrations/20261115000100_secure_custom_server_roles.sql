/*
  Custom server roles and automatic role rules.
  Authorization is enforced by RLS; client-side checks are presentation only.
*/

CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3987ff',
  icon text,
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 1,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_roles_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT custom_roles_color_format CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT custom_roles_description_length CHECK (char_length(description) <= 200),
  CONSTRAINT custom_roles_position_range CHECK (position BETWEEN 1 AND 999),
  CONSTRAINT custom_roles_permissions_object CHECK (jsonb_typeof(permissions) = 'object'),
  CONSTRAINT custom_roles_server_name_unique UNIQUE (server_id, name),
  CONSTRAINT custom_roles_id_server_unique UNIQUE (id, server_id)
);

CREATE INDEX IF NOT EXISTS custom_roles_server_position_idx
  ON public.custom_roles (server_id, position DESC);

CREATE TABLE IF NOT EXISTS public.member_roles (
  server_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id, role_id),
  CONSTRAINT member_roles_member_fk
    FOREIGN KEY (server_id, user_id)
    REFERENCES public.server_members(server_id, user_id) ON DELETE CASCADE,
  CONSTRAINT member_roles_role_fk
    FOREIGN KEY (role_id, server_id)
    REFERENCES public.custom_roles(id, server_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS member_roles_user_server_idx
  ON public.member_roles (server_id, user_id);

CREATE TABLE IF NOT EXISTS public.auto_role_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  event_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auto_role_rules_role_fk
    FOREIGN KEY (role_id, server_id)
    REFERENCES public.custom_roles(id, server_id) ON DELETE CASCADE,
  CONSTRAINT auto_role_rules_event_type
    CHECK (event_type IN ('join', 'account_age', 'profile_verified', 'activity')),
  CONSTRAINT auto_role_rules_conditions_object
    CHECK (jsonb_typeof(conditions) = 'object')
);

CREATE INDEX IF NOT EXISTS auto_role_rules_server_idx
  ON public.auto_role_rules (server_id, created_at);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_role_rules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.member_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_role_rules TO authenticated;

DROP POLICY IF EXISTS custom_roles_select_members ON public.custom_roles;
CREATE POLICY custom_roles_select_members
ON public.custom_roles FOR SELECT TO authenticated
USING (public.server_rank(server_id) >= 1);

DROP POLICY IF EXISTS custom_roles_insert_admins ON public.custom_roles;
CREATE POLICY custom_roles_insert_admins
ON public.custom_roles FOR INSERT TO authenticated
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS custom_roles_update_admins ON public.custom_roles;
CREATE POLICY custom_roles_update_admins
ON public.custom_roles FOR UPDATE TO authenticated
USING (public.server_rank(server_id) >= 3)
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS custom_roles_delete_admins ON public.custom_roles;
CREATE POLICY custom_roles_delete_admins
ON public.custom_roles FOR DELETE TO authenticated
USING (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS member_roles_select_members ON public.member_roles;
CREATE POLICY member_roles_select_members
ON public.member_roles FOR SELECT TO authenticated
USING (public.server_rank(server_id) >= 1);

DROP POLICY IF EXISTS member_roles_insert_admins ON public.member_roles;
CREATE POLICY member_roles_insert_admins
ON public.member_roles FOR INSERT TO authenticated
WITH CHECK (
  public.server_rank(server_id) >= 3
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = member_roles.role_id
      AND cr.server_id = member_roles.server_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = member_roles.server_id
      AND sm.user_id = member_roles.user_id
  )
);

DROP POLICY IF EXISTS member_roles_delete_admins ON public.member_roles;
CREATE POLICY member_roles_delete_admins
ON public.member_roles FOR DELETE TO authenticated
USING (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS auto_role_rules_select_admins ON public.auto_role_rules;
CREATE POLICY auto_role_rules_select_admins
ON public.auto_role_rules FOR SELECT TO authenticated
USING (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS auto_role_rules_insert_admins ON public.auto_role_rules;
CREATE POLICY auto_role_rules_insert_admins
ON public.auto_role_rules FOR INSERT TO authenticated
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS auto_role_rules_update_admins ON public.auto_role_rules;
CREATE POLICY auto_role_rules_update_admins
ON public.auto_role_rules FOR UPDATE TO authenticated
USING (public.server_rank(server_id) >= 3)
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS auto_role_rules_delete_admins ON public.auto_role_rules;
CREATE POLICY auto_role_rules_delete_admins
ON public.auto_role_rules FOR DELETE TO authenticated
USING (public.server_rank(server_id) >= 3);
