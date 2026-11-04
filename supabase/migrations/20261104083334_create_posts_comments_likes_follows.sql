/*
# Create posts, comments, likes and follows

Plain-English summary: adds the social feed. People publish text and image posts to their profile or to a server. Others can like posts, comment on them and reply to comments. People can follow each other. Authors can edit and delete their own content; server moderators can remove posts and comments in their server.

1. New Tables
- `posts`: author, optional server (community posts), text body up to 2000 characters, optional image, timestamps.
- `comments`: belongs to a post, optional parent comment (replies), body up to 1000 characters, timestamps. A reply must belong to the same post as its parent.
- `likes`: one like per person per post.
- `follows`: one row per follower and followed person; nobody can follow themselves.

2. Security
- Row Level Security enabled on every table.
- Posts in private servers are visible only to that server's members. Other posts are visible to signed-in users.
- Only the author can change a post or comment text; the author or a server moderator can delete it.
- Likes and follows can only be created or removed by the person making them.
- Authors are set from the signed-in account; they cannot be assigned to someone else.

3. Notes
- Notifications for likes, comments and follows are added in a later migration.
*/

CREATE OR REPLACE FUNCTION public.validate_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.comments c
     WHERE c.id = NEW.parent_id
       AND c.post_id = NEW.post_id
  ) THEN
    RAISE EXCEPTION 'Reply parent must belong to the same post';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_body_length CHECK (char_length(body) <= 2000),
  CONSTRAINT posts_has_content CHECK (char_length(btrim(body)) > 0 OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_created_idx ON public.posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_server_created_idx ON public.posts (server_id, created_at DESC) WHERE server_id IS NOT NULL;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS comments_post_created_idx ON public.comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);

DROP TRIGGER IF EXISTS comments_set_updated_at ON public.comments;
CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS comments_validate_parent ON public.comments;
CREATE TRIGGER comments_validate_parent
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_parent();

CREATE TABLE IF NOT EXISTS public.likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS likes_user_id_idx ON public.likes (user_id);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_not_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.posts TO authenticated;
GRANT INSERT (author_id, server_id, body, image_url) ON public.posts TO authenticated;
GRANT UPDATE (body, image_url) ON public.posts TO authenticated;
GRANT DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.comments TO authenticated;
GRANT INSERT (post_id, parent_id, author_id, body) ON public.comments TO authenticated;
GRANT UPDATE (body) ON public.comments TO authenticated;
GRANT DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.likes TO authenticated;
GRANT INSERT (post_id, user_id) ON public.likes TO authenticated;
GRANT DELETE ON public.likes TO authenticated;
GRANT SELECT ON public.follows TO authenticated;
GRANT INSERT (follower_id, following_id) ON public.follows TO authenticated;
GRANT DELETE ON public.follows TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_comment_parent() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
CREATE POLICY "posts_select_visible" ON public.posts FOR SELECT
TO authenticated USING (server_id IS NULL OR public.is_server_visible(server_id));

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT
TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND (server_id IS NULL OR public.server_rank(server_id) >= 1)
);

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE
TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "posts_delete_author_or_moderator" ON public.posts;
CREATE POLICY "posts_delete_author_or_moderator" ON public.posts FOR DELETE
TO authenticated USING (
  author_id = auth.uid()
  OR (server_id IS NOT NULL AND public.server_rank(server_id) >= 2)
);

DROP POLICY IF EXISTS "comments_select_on_visible_posts" ON public.comments;
CREATE POLICY "comments_select_on_visible_posts" ON public.comments FOR SELECT
TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id));

DROP POLICY IF EXISTS "comments_insert_own_on_visible_posts" ON public.comments;
CREATE POLICY "comments_insert_own_on_visible_posts" ON public.comments FOR INSERT
TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
);

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE
TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "comments_delete_author_or_post_moderator" ON public.comments;
CREATE POLICY "comments_delete_author_or_post_moderator" ON public.comments FOR DELETE
TO authenticated USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.posts p
     WHERE p.id = comments.post_id
       AND (p.author_id = auth.uid() OR (p.server_id IS NOT NULL AND public.server_rank(p.server_id) >= 2))
  )
);

DROP POLICY IF EXISTS "likes_select_on_visible_posts" ON public.likes;
CREATE POLICY "likes_select_on_visible_posts" ON public.likes FOR SELECT
TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = likes.post_id));

DROP POLICY IF EXISTS "likes_insert_own_on_visible_posts" ON public.likes;
CREATE POLICY "likes_insert_own_on_visible_posts" ON public.likes FOR INSERT
TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = likes.post_id)
);

DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
CREATE POLICY "likes_delete_own" ON public.likes FOR DELETE
TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "follows_select_signed_in" ON public.follows;
CREATE POLICY "follows_select_signed_in" ON public.follows FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON public.follows;
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT
TO authenticated WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "follows_delete_own" ON public.follows;
CREATE POLICY "follows_delete_own" ON public.follows FOR DELETE
TO authenticated USING (follower_id = auth.uid());
