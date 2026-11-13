import { supabase } from '@/lib/supabase';
import type {
  Channel,
  CreateChannelInput,
  CreateServerInput,
  MemberWithProfile,
  ProfileLite,
  Server,
  ServerMember,
  ServerRoleName,
  ServerWithMeta,
} from '@/types/servers';

type MemberCountRow = { count: number } | { count: number }[];

function readCount(value: MemberCountRow | null | undefined): number {
  if (!value) return 0;
  if (Array.isArray(value)) return value[0]?.count ?? 0;
  return value.count ?? 0;
}

function mapServerWithMeta(
  row: Server & { server_members?: MemberCountRow | null },
  myRole: ServerRoleName | null,
): ServerWithMeta {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description,
    icon_url: row.icon_url,
    banner_url: row.banner_url,
    theme_color: row.theme_color,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member_count: readCount(row.server_members ?? null),
    my_role: myRole,
  };
}

export async function fetchMyMemberships(userId: string): Promise<ServerMember[]> {
  const { data, error } = await supabase
    .from('server_members')
    .select('server_id, user_id, role, joined_at')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []) as ServerMember[];
}

export async function fetchMyServers(userId: string): Promise<ServerWithMeta[]> {
  const memberships = await fetchMyMemberships(userId);
  if (memberships.length === 0) return [];

  const roleByServer = new Map(memberships.map((m) => [m.server_id, m.role]));
  const ids = memberships.map((m) => m.server_id);

  const { data, error } = await supabase
    .from('servers')
    .select('*, server_members(count)')
    .in('id', ids)
    .order('name', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as (Server & { server_members?: MemberCountRow })[]).map((row) =>
    mapServerWithMeta(row, roleByServer.get(row.id) ?? null),
  );
}

export async function fetchPublicServers(userId: string): Promise<ServerWithMeta[]> {
  const memberships = await fetchMyMemberships(userId);
  const roleByServer = new Map(memberships.map((m) => [m.server_id, m.role]));

  const { data, error } = await supabase
    .from('servers')
    .select('*, server_members(count)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return ((data ?? []) as (Server & { server_members?: MemberCountRow })[]).map((row) =>
    mapServerWithMeta(row, roleByServer.get(row.id) ?? null),
  );
}

export async function fetchServerById(serverId: string, userId: string): Promise<ServerWithMeta | null> {
  const { data, error } = await supabase
    .from('servers')
    .select('*, server_members(count)')
    .eq('id', serverId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: membership } = await supabase
    .from('server_members')
    .select('role')
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .maybeSingle();

  return mapServerWithMeta(
    data as Server & { server_members?: MemberCountRow },
    (membership?.role as ServerRoleName | undefined) ?? null,
  );
}

export async function createServer(input: CreateServerInput, userId: string): Promise<Server> {
  const payload = {
    owner_id: userId,
    name: input.name.trim(),
    description: input.description.trim(),
    visibility: input.visibility,
    icon_url: input.icon_url?.trim() || null,
    theme_color: input.theme_color?.trim() || '#2f7cff',
  };

  const { data, error } = await supabase.from('servers').insert(payload).select('*').single();
  if (error) throw error;

  const server = data as Server;

  // Best-effort default channel. Owner membership is created by a DB trigger,
  // so rank should allow this insert. Failure is non-fatal.
  const { error: channelError } = await supabase.from('channels').insert({
    server_id: server.id,
    name: 'general',
    topic: 'General discussion',
    category: 'General',
    position: 0,
    is_restricted: false,
  });
  if (channelError) {
    console.error('Default channel create failed:', channelError.message);
  }

  return server;
}

export async function joinPublicServer(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('server_members').insert({
    server_id: serverId,
    user_id: userId,
    role: 'member',
  });

  if (error) {
    // Unique violation = already a member
    if (error.code === '23505') return;
    throw error;
  }
}

export async function leaveServer(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('server_members')
    .delete()
    .eq('server_id', serverId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function fetchChannels(serverId: string): Promise<Channel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('server_id', serverId)
    .order('position', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Channel[];
}

export async function createChannel(input: CreateChannelInput): Promise<Channel> {
  const name = input.name.trim().toLowerCase();
  const topic = (input.topic ?? '').trim();
  const category = (input.category ?? 'General').trim() || 'General';
  const position = input.position ?? 0;
  const is_restricted = Boolean(input.is_restricted);

  const { data, error } = await supabase
    .from('channels')
    .insert({
      server_id: input.server_id,
      name,
      topic,
      category,
      position,
      is_restricted,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Channel;
}

export async function fetchServerMembers(serverId: string): Promise<MemberWithProfile[]> {
  const { data, error } = await supabase
    .from('server_members')
    .select('server_id, user_id, role, joined_at')
    .eq('server_id', serverId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  const members = (data ?? []) as ServerMember[];
  if (members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    ((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p]),
  );

  return members.map((m) => ({
    ...m,
    profile: profileMap.get(m.user_id) ?? null,
  }));
}


export interface UpdateChannelInput {
  name: string;
  topic: string;
  category: string;
  is_restricted: boolean;
  slowmode_seconds: number;
}

export async function updateChannel(
  channelId: string,
  input: UpdateChannelInput,
): Promise<Channel> {
  const name = input.name.trim().toLowerCase();
  const topic = input.topic.trim();
  const category = input.category.trim();

  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(name)) {
    throw new Error('Channel name must use lowercase letters, numbers, and hyphens (1–50 characters).');
  }
  if (topic.length > 200) throw new Error('Topic must be 200 characters or fewer.');
  if (!category || category.length > 40) throw new Error('Category must be 1–40 characters.');
  if (!Number.isInteger(input.slowmode_seconds) || input.slowmode_seconds < 0 || input.slowmode_seconds > 3600) {
    throw new Error('Slowmode must be between 0 and 3600 seconds.');
  }

  const { data, error } = await supabase
    .from('channels')
    .update({ name, topic, category, is_restricted: input.is_restricted, slowmode_seconds: input.slowmode_seconds })
    .eq('id', channelId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Channel;
}


export async function reorderChannel(
  serverId: string,
  channelId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, category, position')
    .eq('server_id', serverId)
    .order('position', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Pick<Channel, 'id' | 'category' | 'position'>[];
  const target = rows.find((row) => row.id === channelId);
  if (!target) throw new Error('Channel could not be found.');

  const categoryRows = rows.filter((row) => row.category === target.category);
  const currentIndex = categoryRows.findIndex((row) => row.id === channelId);
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= categoryRows.length) return;

  const reordered = [...categoryRows];
  [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];

  for (let index = 0; index < reordered.length; index += 1) {
    const { error: updateError } = await supabase
      .from('channels')
      .update({ position: index })
      .eq('id', reordered[index].id)
      .eq('server_id', serverId);
    if (updateError) throw updateError;
  }
}

export async function deleteChannel(channelId: string): Promise<void> {
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);
  if (error) throw error;
}


export type ChannelMemberPermissionKey =
  | 'can_view'
  | 'can_send_messages'
  | 'can_attach_files'
  | 'can_manage_messages';

export interface ChannelMemberPermission {
  channel_id: string;
  user_id: string;
  can_view: boolean | null;
  can_send_messages: boolean | null;
  can_attach_files: boolean | null;
  can_manage_messages: boolean | null;
  updated_at: string;
}

export async function fetchChannelMemberPermissions(
  channelId: string,
): Promise<ChannelMemberPermission[]> {
  const { data, error } = await supabase
    .from('channel_member_permissions')
    .select('channel_id, user_id, can_view, can_send_messages, can_attach_files, can_manage_messages, updated_at')
    .eq('channel_id', channelId);
  if (error) throw error;
  return (data ?? []) as ChannelMemberPermission[];
}

export async function setChannelMemberPermission(
  channelId: string,
  userId: string,
  permission: ChannelMemberPermissionKey,
  value: boolean | null,
): Promise<ChannelMemberPermission> {
  const { data: existing, error: readError } = await supabase
    .from('channel_member_permissions')
    .select('channel_id, user_id, can_view, can_send_messages, can_attach_files, can_manage_messages')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const { data, error } = await supabase
    .from('channel_member_permissions')
    .upsert({
      channel_id: channelId,
      user_id: userId,
      can_view: existing?.can_view ?? null,
      can_send_messages: existing?.can_send_messages ?? null,
      can_attach_files: existing?.can_attach_files ?? null,
      can_manage_messages: existing?.can_manage_messages ?? null,
      [permission]: value,
    }, { onConflict: 'channel_id,user_id' })
    .select('channel_id, user_id, can_view, can_send_messages, can_attach_files, can_manage_messages, updated_at')
    .single();
  if (error) throw error;
  return data as ChannelMemberPermission;
}
