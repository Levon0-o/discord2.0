import { supabase } from '@/lib/supabase';

export interface ServerInvitation {
  id: string;
  server_id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function fetchServerInvitations(serverId: string): Promise<ServerInvitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, server_id, code, created_by, max_uses, uses, expires_at, revoked_at, created_at')
    .eq('server_id', serverId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;
  return (data ?? []) as ServerInvitation[];
}

export async function createServerInvitation(input: {
  serverId: string;
  userId: string;
  maxUses: number | null;
  expiresAt: string | null;
}): Promise<ServerInvitation> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      server_id: input.serverId,
      created_by: input.userId,
      max_uses: input.maxUses,
      expires_at: input.expiresAt,
    })
    .select('id, server_id, code, created_by, max_uses, uses, expires_at, revoked_at, created_at')
    .single();

  if (error) throw error;
  return data as ServerInvitation;
}

export async function revokeServerInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId);

  if (error) throw error;
}

export async function redeemServerInvitation(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_server_invitation', {
    p_code: code.trim(),
  });

  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('The invitation was accepted, but the server could not be loaded. Refresh and try again.');
  }

  return data;
}
