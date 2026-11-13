-- Global Explore media support: public video uploads owned by the uploader.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'text';

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_media_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_media_type_check
  CHECK (media_type IN ('text', 'image', 'video'));

-- Existing image_url stores the public URL for either an image or a video.
-- Keep text-only posts valid and require a URL for image/video posts.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_has_content;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_has_content
  CHECK (
    char_length(btrim(body)) > 0
    OR image_url IS NOT NULL
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'explore-videos',
  'explore-videos',
  true,
  104857600,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Explore videos are publicly readable" ON storage.objects;
CREATE POLICY "Explore videos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'explore-videos');

DROP POLICY IF EXISTS "Users upload their own Explore videos" ON storage.objects;
CREATE POLICY "Users upload their own Explore videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'explore-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete their own Explore videos" ON storage.objects;
CREATE POLICY "Users delete their own Explore videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'explore-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

GRANT SELECT ON public.posts TO authenticated;
GRANT INSERT (body, image_url, media_type, server_id, author_id) ON public.posts TO authenticated;
