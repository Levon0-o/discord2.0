import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Flag, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';

import { fetchServerEventChatReportsForServer, reviewServerEventChatReport, type ServerEventChatReport, type ServerEventChatReportStatus } from '@/lib/serverEventChatApi';
import { fetchServerEvents, type ServerEvent } from '@/lib/serverEventsApi';
import type { MemberWithProfile, ServerWithMeta } from '@/types/servers';

interface ServerModerationDashboardProps {
  server: ServerWithMeta;
  members: MemberWithProfile[];
  onClose: () => void;
}

type ReportFilter = 'open' | 'resolved' | 'dismissed' | 'all';

const FILTERS: { id: ReportFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All reports' },
];

function displayMember(members: MemberWithProfile[], userId: string): string {
  const member = members.find((item) => item.user_id === userId);
  return member?.profile?.display_name || member?.profile?.username || 'Unknown member';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ServerModerationDashboard({ server, members, onClose }: ServerModerationDashboardProps) {
  const [reports, setReports] = useState<ServerEventChatReport[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [filter, setFilter] = useState<ReportFilter>('open');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [nextReports, nextEvents] = await Promise.all([
        fetchServerEventChatReportsForServer(server.id),
        fetchServerEvents(server.id),
      ]);
      setReports(nextReports);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load moderation reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [server.id]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const eventNames = useMemo(() => new Map(events.map((event) => [event.id, event.title])), [events]);
  const counts = useMemo(() => ({
    open: reports.filter((report) => report.status === 'open').length,
    resolved: reports.filter((report) => report.status === 'resolved').length,
    dismissed: reports.filter((report) => report.status === 'dismissed').length,
  }), [reports]);
  const visibleReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return reports.filter((report) => {
      if (filter !== 'all' && report.status !== filter) return false;
      if (!query) return true;
      const searchable = [
        report.reason.replace(/_/g, ' '),
        report.message_body,
        report.details,
        displayMember(members, report.reporter_id),
        displayMember(members, report.reported_user_id),
        eventNames.get(report.event_id) ?? '',
      ].join(' ').toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [reports, filter, search, members, eventNames]);

  async function handleReview(reportId: string, status: Exclude<ServerEventChatReportStatus, 'open'>) {
    setBusyReportId(reportId);
    setError('');
    setNotice('');
    try {
      await reviewServerEventChatReport(reportId, status);
      setReports((current) => current.map((report) => report.id === reportId
        ? { ...report, status, reviewed_at: new Date().toISOString() }
        : report));
      setNotice(status === 'resolved' ? 'Report marked as resolved.' : 'Report dismissed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this report.');
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Back to server"><ArrowLeft size={17} /></button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200"><ShieldAlert size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Server moderation</p>
          <h1 className="truncate text-sm font-bold text-ink-100">{server.name}</h1>
        </div>
        <button type="button" onClick={() => void loadReports(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-ink-300 transition hover:bg-white/[0.05] disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-500 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close moderation"><X size={17} /></button>
      </header>

      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3"><p className="text-[10px] uppercase tracking-wide text-amber-200">Open</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{counts.open}</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-wide text-ink-400">Resolved</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{counts.resolved}</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-wide text-ink-400">Dismissed</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{counts.dismissed}</p></div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1">
            {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={'rounded-lg px-3 py-2 text-[11px] font-medium transition ' + (filter === item.id ? 'bg-primary-500/20 text-primary-200' : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-100')}>{item.label}{item.id !== 'all' ? <span className="ml-1.5 tabular-nums opacity-70">{counts[item.id]}</span> : null}</button>)}
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports…" className="w-full rounded-xl border border-white/[0.08] bg-ink-900 py-2.5 pl-9 pr-3 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
          </label>
        </div>

        {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}

        {loading ? <div className="py-16 text-center text-xs text-ink-500">Loading moderation reports…</div>
          : visibleReports.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.09] px-5 py-14 text-center">
            <Flag size={24} className="mx-auto text-ink-600" />
            <p className="mt-3 text-sm font-semibold text-ink-200">{reports.length === 0 ? 'No reports yet' : 'No reports match this view'}</p>
            <p className="mt-1 text-xs text-ink-500">{reports.length === 0 ? 'Reports submitted in event chats will appear here.' : 'Try another filter or search term.'}</p>
          </div> : <div className="space-y-3">
            {visibleReports.map((report) => <article key={report.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">{report.reason.replace(/_/g, ' ')}</span>
                    <span className={'rounded-md px-2 py-1 text-[10px] font-semibold uppercase ' + (report.status === 'open' ? 'bg-amber-400/10 text-amber-200' : report.status === 'resolved' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.06] text-ink-400')}>{report.status}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-400">{eventNames.get(report.event_id) ?? 'Server event'} · {formatDate(report.created_at)}</p>
                </div>
                {report.status === 'open' ? <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={busyReportId === report.id} onClick={() => void handleReview(report.id, 'resolved')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"><Check size={13} /> Resolve</button>
                  <button type="button" disabled={busyReportId === report.id} onClick={() => void handleReview(report.id, 'dismissed')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-ink-300 transition hover:bg-white/[0.05] disabled:opacity-50"><X size={13} /> Dismiss</button>
                </div> : <span className="inline-flex items-center gap-1 text-[10px] text-ink-500"><Clock3 size={12} /> Reviewed</span>}
              </div>
              <div className="mt-3 rounded-xl border border-white/[0.05] bg-ink-950/70 p-3">
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-200">{report.message_body || 'Attachment-only message'}</p>
                {report.details ? <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-ink-400">Reporter details: {report.details}</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-ink-500">
                <span>Reported member: <strong className="font-medium text-ink-300">{displayMember(members, report.reported_user_id)}</strong></span>
                <span>Submitted by: <strong className="font-medium text-ink-300">{displayMember(members, report.reporter_id)}</strong></span>
              </div>
            </article>)}
          </div>}
      </main>
    </div>
  );
}
