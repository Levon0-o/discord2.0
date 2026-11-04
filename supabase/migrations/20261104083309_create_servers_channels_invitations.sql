/*
# Create servers, roles, members, channels and invitations

Plain-English summary: adds community servers. Each server has a name, description, icon, banner, theme colour and visibility (public or private). Servers contain members with roles (owner, administrator, moderator, member), and text channels grouped into categories. Administrators can invite people with codes. Permissions are enforced by the database, not just the app.

1. New Tables
- `server_roles`: the four fixed roles with a rank (owner 4, administrator 3, moderator 2, member 1). Read-only for users.
- `servers`: name, description, icon, banner, theme colour, visibility, and owner. The owner is always a member.
- `server_members`: who belongs to which server and with which role. Members can join public servers and leave; owners cannot leave.
- `channels`: text channels with name, topic, category, position and a "restricted" flag. Restricted channels are visible only to moderators and above.
- `invitations`: invitation codes (unguessable, generated automatically) with optional expiry, usage limit, revocation, or a direct invitation to one person.

2. Security
- Row Level Security enabled on every table above.
- Permission helper functions run with elevated rights only to read membership, so policies cannot recurse. They are restricted from anonymous access.
- Administrators and above manage servers, channels and invitations; moderators and above manage invitations; administrators can change member roles only below their own rank.
- Owners automatically become members through a trigger; ownership cannot be transferred or removed by a policy.
- Grants are limited to the columns and actions the app needs (for example, members cannot change their own role).

3. Notes
- Joining invitation-only private servers is handled by a later stage; this migration sets up the data and permission rules.
*/

CREATE TABLE IF NOT EXISTS public.server_roles (
  name text PRIMARY KEY,
  rank smallint NOT NULL UNIQUE,
  label text NOT NULL
);

INSERT INTO public.server_roles (name, rank, label) VALUES
  ('owner', 4, 'Owner'),
  ('admin', 3, 'Administrator'),
  ('moderator', 2, 'Moderator'),
  ('member', 1, 'Member')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_url text,
  banner_url text,
  theme_color text NOT NULL DEFAULT '#2f7cff',
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT servers_name_length CHECK (char_length(name) BETWEEN 2 AND 60),
  CONSTRAINT servers_description_length CHECK (char_length(description) <= 500),
  CONSTRAINT servers_theme_color_format CHECK (theme_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT servers_visibility_values CHECK (visibility IN ('public', 'private'))
);

CREATE INDEX IF NOT EXISTS servers_owner_id_idx ON public.servers (owner_id);
CREATE INDEX IF NOT EXISTS servers_visibility_created_idx ON public.servers (visibility, created_at DESC);

DROP TRIGGER IF EXISTS servers_set_updated_at ON public.servers;
CREATE TRIGGER servers_set_updated_at
BEFORE UPDATE ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.server_members (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' REFERENCES public.server_roles(name),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS server_members_user_id_idx ON public.server_members (user_id);

CREATE OR REPLACE FUNCTION public.server_rank(p_server_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT r.rank
       FROM public.server_members m
       JOIN public.server_roles r ON r.name = m.role
      WHERE m.server_id = p_server_id
        AND m.user_id = auth.uid()),
    0
  );
$$;

CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  position integer NOT NULL DEFAULT 0,
  is_restricted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channels_name_format CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  CONSTRAINT channels_topic_length CHECK (char_length(topic) <= 200),
  CONSTRAINT channels_category_length CHECK (char_length(category) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS channels_server_position_idx ON public.channels (server_id, position);

DROP TRIGGER IF EXISTS channels_set_updated_at ON public.channels;
CREATE TRIGGER channels_set_updated_at
BEFORE UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT invitations_uses_within_max CHECK (max_uses IS NULL OR uses <= max_uses)
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_code_key ON public.invitations (code);
CREATE INDEX IF NOT EXISTS invitations_server_id_idx ON public.invitations (server_id);
CREATE INDEX IF NOT EXISTS invitations_invited_user_id_idx ON public.invitations (invited_user_id) WHERE invited_user_id IS NOT NULL;

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
       AND (NOT c.is_restricted OR public.server_rank(c.server_id) >= 2)
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
       AND public.server_rank(c.server_id) >= 2
  );
$$;

CREATE OR REPLACE FUNCTION public.is_server_visible(p_server_id uuid)
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
       AND (s.visibility = 'public' OR public.server_rank(s.id) >= 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (server_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servers_add_owner_member ON public.servers;
CREATE TRIGGER servers_add_owner_member
AFTER INSERT ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.server_roles TO authenticated;
GRANT SELECT ON public.servers TO authenticated;
GRANT INSERT (owner_id, name, description, icon_url, banner_url, theme_color, visibility) ON public.servers TO authenticated;
GRANT UPDATE (name, description, icon_url, banner_url, theme_color, visibility) ON public.servers TO authenticated;
GRANT DELETE ON public.servers TO authenticated;
GRANT SELECT ON public.server_members TO authenticated;
GRANT INSERT (server_id, user_id, role) ON public.server_members TO authenticated;
GRANT UPDATE (role) ON public.server_members TO authenticated;
GRANT DELETE ON public.server_members TO authenticated;
GRANT SELECT ON public.channels TO authenticated;
GRANT INSERT (server_id, name, topic, category, position, is_restricted) ON public.channels TO authenticated;
GRANT UPDATE (name, topic, category, position, is_restricted) ON public.channels TO authenticated;
GRANT DELETE ON public.channels TO authenticated;
GRANT SELECT ON public.invitations TO authenticated;
GRANT INSERT (server_id, created_by, invited_user_id, max_uses, expires_at) ON public.invitations TO authenticated;
GRANT UPDATE (max_uses, expires_at, revoked_at) ON public.invitations TO authenticated;
GRANT DELETE ON public.invitations TO authenticated;

REVOKE EXECUTE ON FUNCTION public.server_rank(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_rank(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_moderate_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_channel(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_server_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_server_visible(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.add_owner_as_member() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "server_roles_select_signed_in" ON public.server_roles;
CREATE POLICY "server_roles_select_signed_in" ON public.server_roles FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "servers_select_visible" ON public.servers;
CREATE POLICY "servers_select_visible" ON public.servers FOR SELECT
TO authenticated USING (visibility = 'public' OR owner_id = auth.uid() OR public.server_rank(id) >= 1);

DROP POLICY IF EXISTS "servers_insert_as_owner" ON public.servers;
CREATE POLICY "servers_insert_as_owner" ON public.servers FOR INSERT
TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "servers_update_admins" ON public.servers;
CREATE POLICY "servers_update_admins" ON public.servers FOR UPDATE
TO authenticated USING (public.server_rank(id) >= 3) WITH CHECK (public.server_rank(id) >= 3);

DROP POLICY IF EXISTS "servers_delete_owner" ON public.servers;
CREATE POLICY "servers_delete_owner" ON public.servers FOR DELETE
TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "server_members_select_visible" ON public.server_members;
CREATE POLICY "server_members_select_visible" ON public.server_members FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.servers s
     WHERE s.id = server_members.server_id
       AND (s.visibility = 'public' OR public.server_rank(s.id) >= 1)
  )
);

DROP POLICY IF EXISTS "server_members_join_public" ON public.server_members;
CREATE POLICY "server_members_join_public" ON public.server_members FOR INSERT
TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND role = 'member'
  AND EXISTS (
    SELECT 1 FROM public.servers s
     WHERE s.id = server_members.server_id
       AND s.visibility = 'public'
  )
);

DROP POLICY IF EXISTS "server_members_update_roles" ON public.server_members;
CREATE POLICY "server_members_update_roles" ON public.server_members FOR UPDATE
TO authenticated
USING (
  public.server_rank(server_id) >= 3
  AND (SELECT r.rank FROM public.server_roles r WHERE r.name = server_members.role) < public.server_rank(server_id)
)
WITH CHECK (
  public.server_rank(server_id) >= 3
  AND (SELECT r.rank FROM public.server_roles r WHERE r.name = server_members.role) < public.server_rank(server_id)
);

DROP POLICY IF EXISTS "server_members_delete_self_or_moderate" ON public.server_members;
CREATE POLICY "server_members_delete_self_or_moderate" ON public.server_members FOR DELETE
TO authenticated USING (
  (user_id = auth.uid() AND role <> 'owner')
  OR (
    public.server_rank(server_id) >= 3
    AND (SELECT r.rank FROM public.server_roles r WHERE r.name = server_members.role) < public.server_rank(server_id)
  )
);

DROP POLICY IF EXISTS "channels_select_accessible" ON public.channels;
CREATE POLICY "channels_select_accessible" ON public.channels FOR SELECT
TO authenticated USING (public.can_view_channel(id));

DROP POLICY IF EXISTS "channels_insert_admins" ON public.channels;
CREATE POLICY "channels_insert_admins" ON public.channels FOR INSERT
TO authenticated WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS "channels_update_admins" ON public.channels;
CREATE POLICY "channels_update_admins" ON public.channels FOR UPDATE
TO authenticated USING (public.server_rank(server_id) >= 3) WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS "channels_delete_admins" ON public.channels;
CREATE POLICY "channels_delete_admins" ON public.channels FOR DELETE
TO authenticated USING (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS "invitations_select_managers_or_invitee" ON public.invitations;
CREATE POLICY "invitations_select_managers_or_invitee" ON public.invitations FOR SELECT
TO authenticated USING (invited_user_id = auth.uid() OR public.server_rank(server_id) >= 2);

DROP POLICY IF EXISTS "invitations_insert_moderators" ON public.invitations;
CREATE POLICY "invitations_insert_moderators" ON public.invitations FOR INSERT
TO authenticated WITH CHECK (created_by = auth.uid() AND public.server_rank(server_id) >= 2);

DROP POLICY IF EXISTS "invitations_update_moderators" ON public.invitations;
CREATE POLICY "invitations_update_moderators" ON public.invitations FOR UPDATE
TO authenticated USING (public.server_rank(server_id) >= 2) WITH CHECK (public.server_rank(server_id) >= 2);

DROP POLICY IF EXISTS "invitations_delete_moderators" ON public.invitations;
CREATE POLICY "invitations_delete_moderators" ON public.invitations FOR DELETE
TO authenticated USING (public.server_rank(server_id) >= 2);
