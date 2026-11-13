/*
  Private realtime typing indicators for direct conversations.
  Only authenticated conversation members can subscribe or broadcast.
*/
DROP POLICY IF EXISTS "dm_typing_members_read" ON realtime.messages;
CREATE POLICY "dm_typing_members_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'dm-typing:%'
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members AS cm
    WHERE cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      AND cm.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "dm_typing_members_send" ON realtime.messages;
CREATE POLICY "dm_typing_members_send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'dm-typing:%'
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members AS cm
    WHERE cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      AND cm.user_id = (SELECT auth.uid())
  )
);
