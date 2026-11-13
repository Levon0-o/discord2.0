/*
  Private server-channel typing indicators.
  Only authenticated members of the channel's server can subscribe or broadcast.
*/
DROP POLICY IF EXISTS "channel_typing_members_read" ON realtime.messages;
CREATE POLICY "channel_typing_members_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'channel-typing:%'
  AND EXISTS (
    SELECT 1
    FROM public.channels AS c
    JOIN public.server_members AS sm ON sm.server_id = c.server_id
    WHERE c.id::text = split_part(realtime.topic(), ':', 2)
      AND sm.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "channel_typing_members_send" ON realtime.messages;
CREATE POLICY "channel_typing_members_send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'channel-typing:%'
  AND EXISTS (
    SELECT 1
    FROM public.channels AS c
    JOIN public.server_members AS sm ON sm.server_id = c.server_id
    WHERE c.id::text = split_part(realtime.topic(), ':', 2)
      AND sm.user_id = (SELECT auth.uid())
  )
);
