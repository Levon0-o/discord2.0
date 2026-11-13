import { supabase } from '@/lib/supabase';

export type ServerEventRsvpStatus = 'going' | 'interested' | 'not_going';

export interface ServerEventRsvp {
  event_id: string;
  user_id: string;
  status: ServerEventRsvpStatus;
  updated_at: string;
}

export interface ServerEvent {
  id: string;
  server_id: string;
  created_by: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  rsvps: ServerEventRsvp[];
}

export async function fetchServerEvents(serverId: string): Promise<ServerEvent[]> {
  const { data: events, error } = await supabase
    .from('server_events')
    .select('id, server_id, created_by, title, description, location, starts_at, ends_at, created_at, updated_at')
    .eq('server_id', serverId)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  const rows = events ?? [];
  if (!rows.length) return [];

  const { data: rsvps, error: rsvpError } = await supabase
    .from('server_event_rsvps')
    .select('event_id, user_id, status, updated_at')
    .in('event_id', rows.map((event) => event.id));
  if (rsvpError) throw rsvpError;

  const byEvent = new Map<string, ServerEventRsvp[]>();
  for (const rsvp of (rsvps ?? []) as ServerEventRsvp[]) {
    const list = byEvent.get(rsvp.event_id) ?? [];
    list.push(rsvp);
    byEvent.set(rsvp.event_id, list);
  }
  return rows.map((event) => ({ ...event, rsvps: byEvent.get(event.id) ?? [] })) as ServerEvent[];
}

export async function createServerEvent(input: {
  serverId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_server_event', {
    p_server_id: input.serverId,
    p_title: input.title,
    p_description: input.description,
    p_location: input.location,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt ?? null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('Event was created but its ID could not be read.');
  return data;
}

export async function setServerEventRsvp(eventId: string, status: ServerEventRsvpStatus): Promise<void> {
  const { error } = await supabase.rpc('set_server_event_rsvp', {
    p_event_id: eventId,
    p_status: status,
  });
  if (error) throw error;
}

export async function updateServerEvent(input: {
  eventId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_server_event', {
    p_event_id: input.eventId,
    p_title: input.title,
    p_description: input.description,
    p_location: input.location,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt ?? null,
  });
  if (error) throw error;
}

export async function deleteServerEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_server_event', { p_event_id: eventId });
  if (error) throw error;
}
