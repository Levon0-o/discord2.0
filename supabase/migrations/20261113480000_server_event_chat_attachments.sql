/*
  Private attachments for server event chat.
  Event members may read files; users may upload/delete only in their own event folder.
*/
alter table public.server_event_chat_messages add column if not exists attachment_path text;
alter table public.server_event_chat_messages drop constraint if exists server_event_chat_messages_body_check;
alter table public.server_event_chat_messages add constraint server_event_chat_messages_body_check
  check (char_length(btrim(body)) <= 2000 and (char_length(btrim(body)) >= 1 or attachment_path is not null));

drop policy if exists server_event_chat_insert_members on public.server_event_chat_messages;
create policy server_event_chat_insert_members on public.server_event_chat_messages for insert to authenticated
with check (
  author_id = auth.uid() and char_length(btrim(body)) <= 2000
  and (char_length(btrim(body)) >= 1 or attachment_path is not null)
  and exists (select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_messages.event_id and sm.user_id = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-chat-attachments', 'event-chat-attachments', false, 15728640,
  array['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_chat_attachments_read_members on storage.objects;
create policy event_chat_attachments_read_members on storage.objects for select to authenticated
using (bucket_id = 'event-chat-attachments' and exists (
  select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
  where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()));

drop policy if exists event_chat_attachments_upload_own_member_folder on storage.objects;
create policy event_chat_attachments_upload_own_member_folder on storage.objects for insert to authenticated
with check (bucket_id = 'event-chat-attachments' and (storage.foldername(name))[2] = auth.uid()::text and exists (
  select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
  where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()));

drop policy if exists event_chat_attachments_delete_own_member_folder on storage.objects;
create policy event_chat_attachments_delete_own_member_folder on storage.objects for delete to authenticated
using (bucket_id = 'event-chat-attachments' and (storage.foldername(name))[2] = auth.uid()::text and exists (
  select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
  where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()));