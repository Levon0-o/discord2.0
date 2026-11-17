-- Social polls: one poll per post, 2-6 options, one vote per user.
CREATE TABLE IF NOT EXISTS public.social_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.social_polls(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 5),
  UNIQUE (poll_id, position),
  UNIQUE (id, poll_id)
);

CREATE TABLE IF NOT EXISTS public.social_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.social_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_poll_votes_one_per_user UNIQUE (poll_id, user_id),
  CONSTRAINT social_poll_votes_option_matches_poll
    FOREIGN KEY (option_id, poll_id)
    REFERENCES public.social_poll_options(id, poll_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS social_poll_options_poll_idx ON public.social_poll_options(poll_id, position);
CREATE INDEX IF NOT EXISTS social_poll_votes_poll_idx ON public.social_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS social_poll_votes_option_idx ON public.social_poll_votes(option_id);

ALTER TABLE public.social_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_poll_votes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.social_polls, public.social_poll_options, public.social_poll_votes TO authenticated;
GRANT INSERT, DELETE ON public.social_poll_votes TO authenticated;

DROP POLICY IF EXISTS "social_polls_read_visible_posts" ON public.social_polls;
CREATE POLICY "social_polls_read_visible_posts" ON public.social_polls
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id)
);

DROP POLICY IF EXISTS "social_poll_options_read_visible_polls" ON public.social_poll_options;
CREATE POLICY "social_poll_options_read_visible_polls" ON public.social_poll_options
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.social_polls sp WHERE sp.id = poll_id)
);

DROP POLICY IF EXISTS "social_poll_votes_read_visible_polls" ON public.social_poll_votes;
CREATE POLICY "social_poll_votes_read_visible_polls" ON public.social_poll_votes
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.social_polls sp WHERE sp.id = poll_id)
);

DROP POLICY IF EXISTS "social_poll_votes_insert_own_open_poll" ON public.social_poll_votes;
CREATE POLICY "social_poll_votes_insert_own_open_poll" ON public.social_poll_votes
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.social_polls sp
    WHERE sp.id = poll_id
      AND (sp.ends_at IS NULL OR sp.ends_at > now())
  )
);

DROP POLICY IF EXISTS "social_poll_votes_delete_own" ON public.social_poll_votes;
CREATE POLICY "social_poll_votes_delete_own" ON public.social_poll_votes
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Poll creation is performed by a trusted server-side workflow; clients cannot
-- create or alter poll definitions directly through the Data API.
REVOKE INSERT, UPDATE, DELETE ON public.social_polls, public.social_poll_options FROM anon, authenticated;
