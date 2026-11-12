
import { supabase } from '@/lib/supabase';
import type {
  CustomRole,
  CreateCustomRoleInput,
  MemberRole,
  AutoRoleRule,
  ServerPermissions,
  UpdateCustomRoleInput,
} from '@/types/servers';

export async function fetchCustomRoles(
  serverId: string,
): Promise<CustomRole[]> {
  const { data, error } = await supabase
    .from('custom_roles')
    .select('*')
    .eq('server_id', serverId)
    .order('position', { ascending: false });

  if (error) throw error;

  return (data ?? []) as CustomRole[];
}

export async function createCustomRole(
  input: CreateCustomRoleInput,
): Promise<CustomRole> {
  const payload = {
    server_id: input.server_id,
    name: input.name.trim(),
    color: input.color,
    icon: input.icon?.trim() || null,
    description: input.description?.trim() || '',
    position: input.position,
    permissions: input.permissions ?? {},
  };

  const { data, error } = await supabase
    .from('custom_roles')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;

  return data as CustomRole;
}

export async function updateCustomRole(
  roleId: string,
  changes: UpdateCustomRoleInput,
): Promise<CustomRole> {
  const payload = {
    ...changes,
    name: changes.name?.trim(),
    description: changes.description?.trim(),
    icon: changes.icon?.trim() || null,
  };

  const { data, error } = await supabase
    .from('custom_roles')
    .update(payload)
    .eq('id', roleId)
    .select('*')
    .single();

  if (error) throw error;

  return data as CustomRole;
}

export async function deleteCustomRole(roleId: string): Promise<void> {
  const { error } = await supabase
    .from('custom_roles')
    .delete()
    .eq('id', roleId);

  if (error) throw error;
}

export async function fetchMemberRoles(
  serverId: string,
): Promise<MemberRole[]> {
  const { data, error } = await supabase
    .from('member_roles')
    .select('server_id, user_id, role_id, assigned_at')
    .eq('server_id', serverId);

  if (error) throw error;

  return (data ?? []) as MemberRole[];
}

export async function assignCustomRole(
  serverId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('member_roles')
    .insert({
      server_id: serverId,
      user_id: userId,
      role_id: roleId,
    });

  if (error) {
    if (error.code === '23505') return;
    throw error;
  }
}

export async function removeCustomRole(
  serverId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('member_roles')
    .delete()
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .eq('role_id', roleId);

  if (error) throw error;
}

export async function fetchAutoRoleRules(
  serverId: string,
): Promise<AutoRoleRule[]> {
  const { data, error } = await supabase
    .from('auto_role_rules')
    .select('*')
    .eq('server_id', serverId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []) as AutoRoleRule[];
}

export function hasPermission(
  permissions: ServerPermissions | null | undefined,
  permission: keyof ServerPermissions,
): boolean {
  return permissions?.[permission] === true;
}
