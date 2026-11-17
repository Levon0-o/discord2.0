/*
  Secure group direct-message lifecycle.
  Group creation and membership changes are performed through SECURITY DEFINER RPCs.
  Only the creator can rename a group or add/remove other members; any member can leave.
*/

-- Prevent clients from bypassing the RPC validation by inserting conversations or members directly.
REVOKE INSERT ON public.conversations FROM authenticated;
REVOKE INSERT (kind, title, created_by) ON public.conversations FROM authenticated;
REVOKE INSERT ON public.conversation_members FROM authenticated;
REVOKE INSERT (conversation_id, user_id) ON public.conversation_members FROM authenticated;

DROP POLICY IF EXISTS "conversation_members_insert_by_members_or_creator" ON public.conversation_members;
DROP POLICY IF EXISTS "conversation_members_delete_own" ON public.conversation_members;
DROP POLICY IF EXISTS "conversations_update_group_members" ON public.conversations;

CREATE POLICY "conversations_update_group_creator" ON public.conversations
FOR UPDATE TO authenticated
USING (kind = 'group' AND created_by = (SELECT auth.uid()))
WITH CHECK (kind = 'group' AND created_by = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_member_ids uuid[],
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := NULLIF(btrim(p_title), '');
  v_member_id uuid;
  v_member_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF p_member_ids IS NULL THEN
    RAISE EXCEPTION 'Select at least two friends.';
  END IF;

  SELECT count(DISTINCT member_id)
    INTO v_member_count
    FROM unnest(p_member_ids) AS member_id;

  IF v_member_count < 2 OR v_member_count > 24
     OR v_member_count <> cardinality(p_member_ids) THEN
    RAISE EXCEPTION 'A group must contain 3–25 unique members, including you.';
  END IF;

  IF v_title IS NOT NULL AND char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'Group names must be 80 characters or fewer.';
  END IF;

  FOREACH v_member_id IN ARRAY p_member_ids LOOP
    IF v_member_id IS NULL OR v_member_id = v_user_id THEN
      RAISE EXCEPTION 'Invalid group member.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_member_id) THEN
      RAISE EXCEPTION 'One of the selected users no longer exists.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.sender_id = v_user_id AND fr.receiver_id = v_member_id)
          OR (fr.sender_id = v_member_id AND fr.receiver_id = v_user_id)
        )
    ) THEN
      RAISE EXCEPTION 'You can only add people who are already your friends.';
    END IF;
  END LOOP;

  INSERT INTO public.conversations (kind, title, created_by)
  VALUES ('group', v_title, v_user_id)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conversation_id, v_user_id);

  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT v_conversation_id, member_id
  FROM unnest(p_member_ids) AS member_id;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_group_conversation(
  p_conversation_id uuid,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title text := NULLIF(btrim(p_title), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF v_title IS NULL OR char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'Group names must contain 1–80 characters.';
  END IF;

  UPDATE public.conversations
     SET title = v_title
   WHERE id = p_conversation_id
     AND kind = 'group'
     AND created_by = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the group creator can rename this conversation.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_group_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid group member.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.kind = 'group' AND c.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the group creator can add members.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'This user no longer exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
      AND (
        (fr.sender_id = auth.uid() AND fr.receiver_id = p_user_id)
        OR (fr.sender_id = p_user_id AND fr.receiver_id = auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'You can only add people who are already your friends.';
  END IF;

  -- Serialize concurrent invites so the 25-member cap cannot be exceeded.
  PERFORM 1
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  SELECT count(*) INTO v_member_count
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id;

  IF EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  IF v_member_count >= 25 THEN
    RAISE EXCEPTION 'This group has reached its 25-member limit.';
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (p_conversation_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use the leave-group action to remove yourself.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.kind = 'group' AND c.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the group creator can remove members.';
  END IF;

  DELETE FROM public.conversation_members
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That user is not a member of this group.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group_conversation(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_next_creator uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    JOIN public.conversations c ON c.id = cm.conversation_id
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = v_user_id
      AND c.kind = 'group'
  ) THEN
    RAISE EXCEPTION 'You are not a member of this group.';
  END IF;

  SELECT cm.user_id INTO v_next_creator
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id
    AND cm.user_id <> v_user_id
  ORDER BY cm.joined_at ASC, cm.user_id ASC
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.created_by = v_user_id
  ) THEN
    IF v_next_creator IS NULL THEN
      DELETE FROM public.conversations WHERE id = p_conversation_id;
      RETURN;
    END IF;

    UPDATE public.conversations
       SET created_by = v_next_creator
     WHERE id = p_conversation_id;
  END IF;

  DELETE FROM public.conversation_members
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_group_conversation(uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rename_group_conversation(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_conversation_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_conversation_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_group_conversation(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_group_conversation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_group_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group_conversation(uuid) TO authenticated;
