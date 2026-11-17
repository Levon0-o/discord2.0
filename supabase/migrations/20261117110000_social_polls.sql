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


CREATE OR REPLACE FUNCTION public.create_social_poll(
  p_question text,
  p_options text[],
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_post_id uuid;
  v_poll_id uuid;
  v_option text;
  v_position integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(btrim(coalesce(p_question, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Question must be between 1 and 2000 characters';
  END IF;
  IF p_options IS NULL OR cardinality(p_options) NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'A poll needs between 2 and 6 options';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= now() THEN
    RAISE EXCEPTION 'Poll end time must be in the future';
  END IF;

  INSERT INTO public.posts (author_id, body) VALUES (v_user, btrim(p_question))
  RETURNING id INTO v_post_id;
  INSERT INTO public.social_polls (post_id, ends_at)
  VALUES (v_post_id, p_ends_at) RETURNING id INTO v_poll_id;

  FOREACH v_option IN ARRAY p_options LOOP
    IF char_length(btrim(coalesce(v_option, ''))) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Each option must be between 1 and 100 characters';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_options[1:v_position]) AS prior(value)
      WHERE lower(btrim(prior.value)) = lower(btrim(v_option))
    ) THEN
      RAISE EXCEPTION 'Poll options must be unique';
    END IF;
    INSERT INTO public.social_poll_options (poll_id, label, position)
    VALUES (v_poll_id, btrim(v_option), v_position);
    v_position := v_position + 1;
  END LOOP;
  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cast_social_poll_vote(p_poll_id uuid, p_option_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_polls
    WHERE id = p_poll_id AND (ends_at IS NULL OR ends_at > now())
  ) THEN RAISE EXCEPTION 'Poll is closed or does not exist'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_poll_options
    WHERE id = p_option_id AND poll_id = p_poll_id
  ) THEN RAISE EXCEPTION 'Invalid poll option'; END IF;

  DELETE FROM public.social_poll_votes
  WHERE poll_id = p_poll_id AND user_id = v_user;
  INSERT INTO public.social_poll_votes (poll_id, option_id, user_id)
  VALUES (p_poll_id, p_option_id, v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.create_social_poll(text, text[], timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cast_social_poll_vote(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_social_poll(text, text[], timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_social_poll_vote(uuid, uuid) TO authenticated;
