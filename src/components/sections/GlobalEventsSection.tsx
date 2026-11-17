import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, Compass, MapPin, RefreshCw, Search, Users } from 'lucide-react';

import { fetchGlobalServerEvents, setServerEventRsvp, type DiscoverableServerEvent, type ServerEventRsvpStatus } from '@/lib/serverEventsApi';
import { joinPublicServer } from '@/lib/serversApi';
import { supabase } from '@/lib/supabase';

type DateFilter = 'all' | 'today' | 'week' | 'month';

const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'all', label: 'All upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

function formatEventDate(value: string): { day: string; month: string; time: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
    time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date),
  };
}

function matchesDateFilter(value: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (filter === 'today') end.setDate(end.getDate() + 1);
  if (filter === 'week') {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  }
  if (filter === 'month') {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
  }
  return date >= start && date < end;
}

export function GlobalEventsSection() {
  const [events, setEvents] = useState<DiscoverableServerEvent[]>([]);
  const [filter, setFilter] = useState<DateFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadEvents = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [{ data: authData, error: authError }, nextEvents] = await Promise.all([
        supabase.auth.getUser(),
        fetchGlobalServerEvents(),
      ]);
      if (authError) throw authError;
      setUserId(authData.user?.id ?? null);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load global events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return events.filter((event) => {
      if (!matchesDateFilter(event.starts_at, filter)) return false;
      if (!query) return true;
      return [event.title, event.description, event.location, event.server_name]
        .join(' ').toLocaleLowerCase().includes(query);
    });
  }, [events, filter, search]);

  async function handleRsvp(event: DiscoverableServerEvent, status: ServerEventRsvpStatus) {
    if (!userId || busyEventId) return;
    setBusyEventId(event.id);
    setError('');
    setNotice('');
    try {
      if (!event.is_member) {
        await joinPublicServer(event.server_id, userId);
      }
      await setServerEventRsvp(event.id, status);
      setEvents((current) => current.map((item) => {
        if (item.id !== event.id) return item;
        const wasGoing = item.my_rsvp === 'going';
        const wasInterested = item.my_rsvp === 'interested';
        const nextStatus = status;
        return {
          ...item,
          is_member: true,
          my_rsvp: nextStatus,
          going_count: item.going_count + (nextStatus === 'going' ? 1 : 0) - (wasGoing ? 1 : 0),
          interested_count: item.interested_count + (nextStatus === 'interested' ? 1 : 0) - (wasInterested ? 1 : 0),
        };
      }));
      setNotice(event.is_member ? 'Your response has been saved.' : 'You joined the server and saved your event response.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your event response.');
    } finally {
      setBusyEventId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary-400/20 bg-primary-500/10 text-primary-200"><CalendarDays size={22} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-300">Discover communities</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">Global Events</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-400">Find upcoming events hosted by public AFTERDARK servers.</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadEvents(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-xs font-medium text-ink-300 transition hover:bg-white/[0.06] disabled:opacity-50 sm:self-auto">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh events
        </button>
      </header>

      <div className="rounded-2xl border border-white/[0.07] bg-ink-950/60 p-3 sm:p-4">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, servers or locations…" className="w-full rounded-xl border border-white/[0.08] bg-ink-900/80 py-3 pl-10 pr-3 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
        </label>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DATE_FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={'rounded-lg px-3 py-2 text-[11px] font-semibold transition ' + (filter === item.id ? 'bg-primary-500/20 text-primary-200 ring-1 ring-primary-400/20' : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-200')}>{item.label}</button>)}
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2.5 text-xs text-emerald-200">{notice}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-ink-100">Upcoming events</h2><p className="mt-0.5 text-[11px] text-ink-500">{loading ? 'Finding events…' : `${visibleEvents.length} events found`}</p></div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-500"><Compass size={12} /> Public servers only</span>
      </div>

      {loading ? <div className="grid gap-3 md:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-white/[0.035]" /><div className="h-48 animate-pulse rounded-2xl bg-white/[0.035]" /></div>
        : visibleEvents.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.1] px-5 py-16 text-center">
          <CalendarDays size={28} className="mx-auto text-ink-600" />
          <h3 className="mt-3 text-sm font-semibold text-ink-200">{events.length === 0 ? 'No public events yet' : 'No matching events'}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-500">{events.length === 0 ? 'When public servers schedule events, they will appear here.' : 'Try another date filter or a different search.'}</p>
        </div> : <div className="grid gap-3 lg:grid-cols-2">
          {visibleEvents.map((event) => {
            const date = formatEventDate(event.starts_at);
            const busy = busyEventId === event.id;
            return (
              <article key={event.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950/70 transition hover:border-primary-400/20">
                <div className="flex gap-4 p-4 sm:p-5">
                  <div className="flex h-[68px] w-[62px] shrink-0 flex-col items-center justify-center rounded-xl border border-primary-400/20 bg-primary-500/[0.08]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-300">{date.month}</span>
                    <span className="text-2xl font-bold leading-tight tabular-nums text-ink-50">{date.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold text-ink-100">{event.title}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400"><Clock3 size={12} /> {date.time}</p>
                    {event.location ? <p className="mt-1 flex items-center gap-1.5 break-all text-[11px] text-ink-400"><MapPin size={12} /> {event.location}</p> : null}
                  </div>
                </div>
                {event.description ? <p className="px-4 pb-3 text-xs leading-relaxed text-ink-400 sm:px-5">{event.description}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink-200">{event.server_name}</p>
                    <p className="mt-1 flex items-center gap-3 text-[10px] text-ink-500"><span className="inline-flex items-center gap-1"><Users size={11} /> {event.server_member_count} members</span><span>{event.going_count} going · {event.interested_count} interested</span></p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" disabled={busy} onClick={() => void handleRsvp(event, 'interested')} className={'rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition disabled:opacity-50 ' + (event.my_rsvp === 'interested' ? 'border-primary-400/30 bg-primary-500/15 text-primary-200' : 'border-white/[0.08] text-ink-400 hover:bg-white/[0.05]')}>{event.my_rsvp === 'interested' ? <span className="inline-flex items-center gap-1"><Check size={11} /> Interested</span> : 'Interested'}</button>
                    <button type="button" disabled={busy} onClick={() => void handleRsvp(event, 'going')} className={'rounded-lg px-3 py-2 text-[10px] font-semibold transition disabled:opacity-50 ' + (event.my_rsvp === 'going' ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20' : 'bg-primary-500 text-white hover:bg-primary-400')}>{event.my_rsvp === 'going' ? <span className="inline-flex items-center gap-1"><Check size={11} /> Going</span> : 'Join event'}</button>
                  </div>
                </div>
                {!event.is_member ? <p className="border-t border-white/[0.05] px-4 py-2 text-[10px] text-ink-600 sm:px-5">Joining an event also joins its public server.</p> : null}
              </article>
            );
          })}
        </div>}
    </div>
  );
}
