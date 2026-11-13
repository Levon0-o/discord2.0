create table if not exists public.channel_announcements (
  message_id uuid primary key references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists channel_announcements_channel_created_idx
  on public.channel_announcements(channel_id, created_at desc);

alter table public.channel_announcements enable row level security;

drop policy if exists channel_announcements_read on public.channel_announcements;
create policy channel_announcements_read on public.channel_announcements
  for select to authenticated
  using (public.can_view_channel(channel_id));

grant select on public.channel_announcements to authenticated;
revoke insert, update, delete on public.channel_announcements from anon, authenticated;

create or replace function public.create_channel_announcement(
  p_channel_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  if not public.can_send_channel_message(p_channel_id) then
    raise exception 'You do not have permission to send messages in this channel.';
  end if;

  if not public.can_manage_channel_messages(p_channel_id) then
    raise exception 'Only channel moderators or members with announcement permission can publish announcements.';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'Announcement title must contain 1–120 characters.';
  end if;

  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Announcement text must contain 1–4000 characters.';
  end if;

  insert into public.messages (channel_id, author_id, body)
  values (p_channel_id, v_user_id, btrim(p_body))
  returning id into v_message_id;

  insert into public.channel_announcements (message_id, channel_id, created_by, title)
  values (v_message_id, p_channel_id, v_user_id, btrim(p_title));

  return v_message_id;
end;
$$;

revoke all on function public.create_channel_announcement(uuid, text, text) from public, anon;
grant execute on function public.create_channel_announcement(uuid, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'channel_announcements'
    ) then
      execute 'alter publication supabase_realtime add table public.channel_announcements';
    end if;
  end if;
end;
$$;
