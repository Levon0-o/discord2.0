-- Public image uploads for global AFTERDARK posts.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'explore-images',
  'explore-images',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Explore images are publicly readable" ON storage.objects;
CREATE POLICY "Explore images are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'explore-images');

DROP POLICY IF EXISTS "Users upload their own Explore images" ON storage.objects;
CREATE POLICY "Users upload their own Explore images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'explore-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete their own Explore images" ON storage.objects;
CREATE POLICY "Users delete their own Explore images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'explore-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
