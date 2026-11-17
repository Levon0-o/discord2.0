import { supabase } from '@/lib/supabase';

export type SharedListeningRoomType = 'conversation' | 'channel' | 'event';
export type SharedListeningProvider = 'spotify' | 'youtube';

export interface SharedListeningRoom {
  id: string;
  room_type: SharedListeningRoomType;
  room_id: string;
  created_by: string;
  current_item_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SharedListeningQueueItem {
  id: string;
  room_id: string;
  provider: SharedListeningProvider;
  external_url: string;
  added_by: string;
  created_at: string;
}

export async function getOrCreateSharedListeningRoom(
  roomType: SharedListeningRoomType,
  roomId: string,
): Promise<SharedListeningRoom> {
  const { data: roomIdResult, error: createError } = await supabase.rpc(
    'get_or_create_shared_listening_room',
    { p_room_type: roomType, p_room_id: roomId },
  );
  if (createError) throw createError;
  const { data, error } = await supabase
    .from('shared_listening_rooms')
    .select('*')
    .eq('id', roomIdResult)
    .single();
  if (error) throw error;
  return data as SharedListeningRoom;
}

export async function fetchSharedListeningRoom(
  roomType: SharedListeningRoomType,
  roomId: string,
): Promise<SharedListeningRoom | null> {
  const { data, error } = await supabase
    .from('shared_listening_rooms')
    .select('*')
    .eq('room_type', roomType)
    .eq('room_id', roomId)
    .maybeSingle();
  if (error) throw error;
  return data as SharedListeningRoom | null;
}

export async function fetchSharedListeningQueue(roomId: string): Promise<SharedListeningQueueItem[]> {
  const { data, error } = await supabase
    .from('shared_listening_queue')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SharedListeningQueueItem[];
}

export async function addSharedListeningQueueItem(
  roomId: string,
  provider: SharedListeningProvider,
  externalUrl: string,
): Promise<SharedListeningQueueItem> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be logged in.');
  const { data, error } = await supabase
    .from('shared_listening_queue')
    .insert({ room_id: roomId, provider, external_url: externalUrl, added_by: authData.user.id })
    .select('*')
    .single();
  if (error) throw error;
  return data as SharedListeningQueueItem;
}

export async function removeSharedListeningQueueItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('shared_listening_queue').delete().eq('id', itemId);
  if (error) throw error;
}

export async function setSharedListeningCurrentItem(
  roomId: string,
  itemId: string | null,
): Promise<SharedListeningRoom> {
  const { data, error } = await supabase.rpc('set_shared_listening_current_item', {
    p_room_id: roomId,
    p_item_id: itemId,
  });
  if (error) throw error;
  return data as SharedListeningRoom;
}
