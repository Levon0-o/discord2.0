/* Event Chat 26.0 — message reporting and moderator review */

create table if not exists public.server_event_chat_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.server_events(id) on delete cascade,
  message_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'hate_or_discrimination', 'inappropriate_content', 'threats', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  message_body text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint server_event_chat_reports_message_event_fk
    foreign key (message_id, event_id)
    references public.server_event_chat_messages(id, event_id)
    on delete cascade,
  constraint server_event_chat_reports_not_self check (reporter_id <> reported_user_id)
);

create unique index if not exists server_event_chat_reports_reporter_message_uidx
  on public.server_event_chat_reports(reporter_id, message_id);

create index if not exists server_event_chat_reports_event_status_created_idx
  on public.server_event_chat_reports(event_id, status, created_at desc);
create index if not exists server_event_chat_reports_reporter_idx
  on public.server_event_chat_reports(reporter_id, created_at desc);

alter table public.server_event_chat_reports enable row level security;

drop policy if exists server_event_chat_reports_insert_members on public.server_event_chat_reports;
create policy server_event_chat_reports_insert_members
on public.server_event_chat_reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'open'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_reports.event_id
      and sm.user_id = auth.uid()
  )
  and exists (
    select 1 from public.server_event_chat_messages m
    where m.id = server_event_chat_reports.message_id
      and m.event_id = server_event_chat_reports.event_id
      and m.author_id = server_event_chat_reports.reported_user_id
      and m.body = server_event_chat_reports.message_body
      and m.author_id <> auth.uid()
  )
);

drop policy if exists server_event_chat_reports_read_reporter_or_moderator on public.server_event_chat_reports;
create policy server_event_chat_reports_read_reporter_or_moderator
on public.server_event_chat_reports for select to authenticated
using (
  reporter_id = auth.uid()
  or exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_reports.event_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  )
);

drop policy if exists server_event_chat_reports_review_moderators on public.server_event_chat_reports;
create policy server_event_chat_reports_review_moderators
on public.server_event_chat_reports for update to authenticated
using (
  exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_reports.event_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  )
)
with check (
  status in ('resolved', 'dismissed')
  and reviewed_by = auth.uid()
  and reviewed_at is not null
  and exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_reports.event_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  )
);

grant select, insert, update on public.server_event_chat_reports to authenticated;
