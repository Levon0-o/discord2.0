/*
  Adds first-class server voice channels and private Realtime signaling.
  WebRTC media remains peer-to-peer; Supabase relays only signaling/presence.
*/
alter table public.channels
  drop constraint if exists channels_channel_type_check;

alter table public.channels
  add constraint channels_channel_type_check
  check (channel_type in ('text', 'announcement', 'voice'));

comment on column public.channels.channel_type is
  'Channel mode: text, announcement, or voice.';

drop policy if exists server_channel_voice_read_members on realtime.messages;
create policy server_channel_voice_read_members
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'server-channel-voice:%'
  and public.can_view_channel(split_part(realtime.topic(), ':', 2)::uuid)
);

drop policy if exists server_channel_voice_send_members on realtime.messages;
create policy server_channel_voice_send_members
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'server-channel-voice:%'
  and public.can_view_channel(split_part(realtime.topic(), ':', 2)::uuid)
);
