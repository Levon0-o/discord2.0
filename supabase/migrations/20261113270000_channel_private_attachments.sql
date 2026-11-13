/*
# Private server-channel attachments

Attachments are stored privately and can only be read by current members
who can view the channel. Uploads and deletes are restricted to the uploader's
own folder inside a channel they can access.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'channel-attachments',
  'channel-attachments',
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

DROP POLICY IF EXISTS "channel_attachments_read_channel_members" ON storage.objects;
CREATE POLICY "channel_attachments_read_channel_members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'channel-attachments'
  AND public.can_view_channel(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "channel_attachments_upload_own_member_folder" ON storage.objects;
CREATE POLICY "channel_attachments_upload_own_member_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'channel-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.can_view_channel(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "channel_attachments_delete_own_member_folder" ON storage.objects;
CREATE POLICY "channel_attachments_delete_own_member_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'channel-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.can_view_channel(((storage.foldername(name))[1])::uuid)
);
