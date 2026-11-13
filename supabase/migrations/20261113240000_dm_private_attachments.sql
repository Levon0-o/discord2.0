/*
# Private direct-message attachments

Stores DM attachments in a private bucket. Only current members of the
conversation can read objects; users can upload and delete only within their
own folder in conversations they belong to.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dm-attachments',
  'dm-attachments',
  false,
  15728640,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "dm_attachments_read_members" ON storage.objects;
CREATE POLICY "dm_attachments_read_members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dm-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id::text = (storage.foldername(name))[1]
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dm_attachments_upload_own_member_folder" ON storage.objects;
CREATE POLICY "dm_attachments_upload_own_member_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dm-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id::text = (storage.foldername(name))[1]
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dm_attachments_delete_own_member_folder" ON storage.objects;
CREATE POLICY "dm_attachments_delete_own_member_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'dm-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id::text = (storage.foldername(name))[1]
      AND cm.user_id = auth.uid()
  )
);
