/* Event Chat 28.0 — per-user notification mute preferences */

create table if not exists public.server_event_chat_notification_preferences (
  event_id uuid not null references public.server_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.server_event_chat_notification_preferences enable row level security;

drop policy if exists server_event_chat_notification_preferences_select_own on public.server_event_chat_notification_preferences;
create policy server_event_chat_notification_preferences_select_own
on public.server_event_chat_notification_preferences for select to authenticated
using (user_id = auth.uid());

drop policy if exists server_event_chat_notification_preferences_insert_own on public.server_event_chat_notification_preferences;
create policy server_event_chat_notification_preferences_insert_own
on public.server_event_chat_notification_preferences for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_notification_preferences.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_notification_preferences_update_own on public.server_event_chat_notification_preferences;
create policy server_event_chat_notification_preferences_update_own
on public.server_event_chat_notification_preferences for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists server_event_chat_notification_preferences_delete_own on public.server_event_chat_notification_preferences;
create policy server_event_chat_notification_preferences_delete_own
on public.server_event_chat_notification_preferences for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.server_event_chat_notification_preferences to authenticated;

create or replace function public.create_server_event_chat_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_author uuid;
  v_sender_role text;
  v_member record;
  v_normalized_body text;
  v_mention_all boolean;
begin
  if new.body is null then return new; end if;
  v_normalized_body := lower(new.body);

  if new.reply_to_id is not null then
    select m.author_id into v_original_author
    from public.server_event_chat_messages m
    where m.id = new.reply_to_id and m.event_id = new.event_id;

    if v_original_author is not null and v_original_author <> new.author_id
      and not exists (
        select 1 from public.server_event_chat_notification_preferences p
        where p.event_id = new.event_id and p.user_id = v_original_author
          and (p.muted_until is null or p.muted_until > now())
      )
    then
      insert into public.notifications (recipient_id, actor_id, type, entity_id)
      values (v_original_author, new.author_id, 'reply', new.id);
    end if;
  end if;

  if length(v_normalized_body) = 0 then return new; end if;

  select sm.role::text into v_sender_role
  from public.server_events e
  join public.server_members sm on sm.server_id = e.server_id and sm.user_id = new.author_id
  where e.id = new.event_id;

  if v_sender_role is null then return new; end if;
  v_mention_all := v_normalized_body ~ '(^|[^[:alnum:]_])@everyone([^[:alnum:]_]|$)';

  if v_mention_all and v_sender_role in ('owner', 'admin', 'moderator') then
    insert into public.notifications (recipient_id, actor_id, type, entity_id)
    select distinct sm.user_id, new.author_id, 'mention', new.id
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = new.event_id
      and sm.user_id <> new.author_id
      and not exists (
        select 1 from public.server_event_chat_notification_preferences p
        where p.event_id = new.event_id and p.user_id = sm.user_id
          and (p.muted_until is null or p.muted_until > now())
      );
    return new;
  end if;

  for v_member in
    select distinct sm.user_id, p.username
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    join public.profiles p on p.id = sm.user_id
    where e.id = new.event_id and sm.user_id <> new.author_id
      and p.username is not null
      and not exists (
        select 1 from public.server_event_chat_notification_preferences pref
        where pref.event_id = new.event_id and pref.user_id = sm.user_id
          and (pref.muted_until is null or pref.muted_until > now())
      )
  loop
    if v_normalized_body ~ ('(^|[^[:alnum:]_])@' || lower(v_member.username) || '([^[:alnum:]_]|$)') then
      insert into public.notifications (recipient_id, actor_id, type, entity_id)
      values (v_member.user_id, new.author_id, 'mention', new.id);
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.create_server_event_chat_notifications() from public, anon, authenticated;
