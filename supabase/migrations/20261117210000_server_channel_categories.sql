/*
  Persistent server channel categories.
  Existing text-based channel.category values are retained for compatibility.
*/
CREATE TABLE IF NOT EXISTS public.server_channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT server_channel_categories_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT server_channel_categories_position_range CHECK (position BETWEEN 0 AND 9999),
  CONSTRAINT server_channel_categories_server_name_unique UNIQUE (server_id, name)
);

CREATE INDEX IF NOT EXISTS server_channel_categories_server_position_idx
  ON public.server_channel_categories (server_id, position, name);

ALTER TABLE public.server_channel_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_channel_categories TO authenticated;

DROP POLICY IF EXISTS server_channel_categories_select_members ON public.server_channel_categories;
CREATE POLICY server_channel_categories_select_members
ON public.server_channel_categories FOR SELECT TO authenticated
USING (public.server_rank(server_id) >= 1);

DROP POLICY IF EXISTS server_channel_categories_insert_admins ON public.server_channel_categories;
CREATE POLICY server_channel_categories_insert_admins
ON public.server_channel_categories FOR INSERT TO authenticated
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS server_channel_categories_update_admins ON public.server_channel_categories;
CREATE POLICY server_channel_categories_update_admins
ON public.server_channel_categories FOR UPDATE TO authenticated
USING (public.server_rank(server_id) >= 3)
WITH CHECK (public.server_rank(server_id) >= 3);

DROP POLICY IF EXISTS server_channel_categories_delete_admins ON public.server_channel_categories;
CREATE POLICY server_channel_categories_delete_admins
ON public.server_channel_categories FOR DELETE TO authenticated
USING (public.server_rank(server_id) >= 3);

INSERT INTO public.server_channel_categories (server_id, name, position)
SELECT grouped.server_id, grouped.category, row_number() OVER (PARTITION BY grouped.server_id ORDER BY grouped.category) - 1
FROM (
  SELECT DISTINCT server_id, category
  FROM public.channels
  WHERE char_length(btrim(category)) BETWEEN 1 AND 40
) AS grouped
ON CONFLICT (server_id, name) DO NOTHING;
