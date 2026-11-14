create table if not exists public.server_event_chat_poll_option_images (
  event_id uuid not null references public.server_events(id) on delete cascade,
  poll_id uuid not null references public.server_event_chat_polls(id) on delete cascade,
  option_id text not null,
  image_path text not null unique,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id)
);
alter table public.server_event_chat_poll_option_images enable row level security;

drop policy if exists server_event_poll_option_images_read_members on public.server_event_chat_poll_option_images;
create policy server_event_poll_option_images_read_members on public.server_event_chat_poll_option_images for select to authenticated using (
  exists (select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id where e.id = event_id and sm.user_id = auth.uid())
);

drop policy if exists server_event_poll_option_images_insert_editors on public.server_event_chat_poll_option_images;
create policy server_event_poll_option_images_insert_editors on public.server_event_chat_poll_option_images for insert to authenticated with check (
  uploaded_by = auth.uid() and exists (
    select 1 from public.server_event_chat_polls p join public.server_events e on e.id = p.event_id join public.server_members sm on sm.server_id = e.server_id
    where p.id = poll_id and p.event_id = event_id and sm.user_id = auth.uid()
      and (p.created_by = auth.uid() or sm.role in ('owner','admin','moderator'))
      and not exists (select 1 from public.server_event_chat_poll_votes v where v.poll_id = p.id)
      and exists (select 1 from jsonb_array_elements(p.options) option_row where option_row->>'id' = option_id)
  )
);

drop policy if exists server_event_poll_option_images_delete_editors on public.server_event_chat_poll_option_images;
create policy server_event_poll_option_images_delete_editors on public.server_event_chat_poll_option_images for delete to authenticated using (
  exists (
    select 1 from public.server_event_chat_polls p join public.server_events e on e.id = p.event_id join public.server_members sm on sm.server_id = e.server_id
    where p.id = poll_id and p.event_id = event_id and sm.user_id = auth.uid()
      and (p.created_by = auth.uid() or sm.role in ('owner','admin','moderator'))
      and not exists (select 1 from public.server_event_chat_poll_votes v where v.poll_id = p.id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-poll-option-images','event-poll-option-images',false,5242880,array['image/jpeg','image/png','image/gif','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_poll_option_images_read_members on storage.objects;
create policy event_poll_option_images_read_members on storage.objects for select to authenticated using (
  bucket_id = 'event-poll-option-images' and exists (
    select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
    where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()
  )
);

drop policy if exists event_poll_option_images_upload_own_member_folder on storage.objects;
create policy event_poll_option_images_upload_own_member_folder on storage.objects for insert to authenticated with check (
  bucket_id = 'event-poll-option-images' and (storage.foldername(name))[2] = auth.uid()::text and exists (
    select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
    where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()
  )
);

drop policy if exists event_poll_option_images_delete_own_member_folder on storage.objects;
create policy event_poll_option_images_delete_own_member_folder on storage.objects for delete to authenticated using (
  bucket_id = 'event-poll-option-images' and (storage.foldername(name))[2] = auth.uid()::text and exists (
    select 1 from public.server_events e join public.server_members sm on sm.server_id = e.server_id
    where e.id::text = (storage.foldername(name))[1] and sm.user_id = auth.uid()
  )
);
