
import { supabase } from '@/lib/supabase';
import type { ProfileLite } from '@/types/servers';

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface FriendWithProfile {
  request: FriendRequest;
  profile: ProfileLite;
}

export async function searchUsers(username: string): Promise<ProfileLite[]> {
  const query = username.trim().replace(/^@/, '').toLowerCase();

  if (query.length < 3) return [];

  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `%${query}%`)
    .neq('id', user.id)
    .order('username')
    .limit(20);

  if (error) throw error;

  return (data ?? []) as ProfileLite[];
}

export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('receiver_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as FriendRequest[];
}

export async function fetchSentFriendRequests(): Promise<FriendRequest[]> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('sender_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as FriendRequest[];
}

export async function sendFriendRequest(receiverId: string): Promise<FriendRequest> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  if (user.id === receiverId) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status')
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`,
    )
    .in('status', ['pending', 'accepted'])
    .limit(1);

  if (existingError) throw existingError;

  if (existing?.length) {
    throw new Error(
      existing[0].status === 'accepted'
        ? 'You are already friends.'
        : 'A friend request already exists.',
    );
  }

  const { data, error } = await supabase
    .from('friend_requests')
    .insert({
      sender_id: user.id,
      receiver_id: receiverId,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;

  return data as FriendRequest;
}

export async function respondToFriendRequest(
  requestId: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { error } = await supabase
    .from('friend_requests')
    .update({ status })
    .eq('id', requestId)
    .eq('receiver_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('sender_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function fetchFriends(): Promise<FriendWithProfile[]> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data: requests, error: requestsError } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  if (requestsError) throw requestsError;

  const rows = (requests ?? []) as FriendRequest[];
  if (rows.length === 0) return [];

  const friendIds = rows.map((row) =>
    row.sender_id === user.id ? row.receiver_id : row.sender_id,
  );

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', friendIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    ((profiles ?? []) as ProfileLite[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  return rows.flatMap((request) => {
    const friendId =
      request.sender_id === user.id
        ? request.receiver_id
        : request.sender_id;

    const profile = profileMap.get(friendId);

    return profile ? [{ request, profile }] : [];
  });
}
