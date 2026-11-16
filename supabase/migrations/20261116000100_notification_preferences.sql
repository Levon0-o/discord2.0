/* Per-account notification controls. Missing rows use the enabled-by-default behavior. */
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'follow','like','comment','mention','reply',
    'event_rsvp','event_update','event_reminder_24h','event_reminder_1h','event_reminder_15m'
  )),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type)
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.get_my_unread_notification_count()
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select count(*)
  from public.notifications n
  where n.recipient_id = (select auth.uid())
    and n.read_at is null
    and n.type in (
      'follow','like','comment','mention','reply',
      'event_rsvp','event_update','event_reminder_24h','event_reminder_1h','event_reminder_15m'
    )
    and not exists (
      select 1 from public.notification_preferences p
      where p.user_id = (select auth.uid())
        and p.notification_type = n.type
        and p.enabled = false
    );
$$;

grant execute on function public.get_my_unread_notification_count() to authenticated;
