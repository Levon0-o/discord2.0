import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Link2, Plus, Shield, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createServerInvitation,
  fetchServerInvitations,
  revokeServerInvitation,
  type ServerInvitation,
} from '@/lib/serverInvitationsApi';

interface InviteManagerProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

function formatExpiry(value: string | null): string {
  if (!value) return 'Never expires';
  return new Date(value).toLocaleString();
}

export function InviteManager({ serverId, serverName, onClose }: InviteManagerProps) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const [invitations, setInvitations] = useState<ServerInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [maxUses, setMaxUses] = useState('0');
  const [expiry, setExpiry] = useState('7');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadInvitations() {
    setLoading(true);
    setError('');
    try {
      setInvitations(await fetchServerInvitations(serverId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invitations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvitations();
  }, [serverId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || busy) return;
    setBusy(true);
    setError('');
    try {
      const expiresAt = expiry === 'never'
        ? null
        : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
      const created = await createServerInvitation({
        serverId,
        userId,
        maxUses: maxUses === '0' ? null : Number(maxUses),
        expiresAt,
      });
      setInvitations((current) => [created, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(invitation: ServerInvitation) {
    try {
      const inviteUrl = new URL(window.location.origin);
      inviteUrl.searchParams.set('invite', invitation.code);
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopiedId(invitation.id);
    } catch {
      setError('Clipboard access was blocked. Select and copy the invitation code manually.');
    }
  }

  async function handleRevoke(invitation: ServerInvitation) {
    if (busy || invitation.revoked_at) return;
    setBusy(true);
    setError('');
    try {
      await revokeServerInvitation(invitation.id);
      setInvitations((current) => current.map((item) =>
        item.id === invitation.id ? { ...item, revoked_at: new Date().toISOString() } : item
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="invite-manager-title" className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.07] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-200"><Link2 size={18} /></div>
            <div>
              <h2 id="invite-manager-title" className="text-base font-bold text-ink-50">Invite people</h2>
              <p className="text-[11px] text-ink-500">{serverName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close"><X size={17} /></button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {error ? <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}

          <form onSubmit={(event) => void handleCreate(event)} className="space-y-3 rounded-xl border border-primary-400/20 bg-primary-500/[0.05] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-100"><Plus size={15} className="text-primary-300" /> Create an invitation</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-ink-400">
                <span>Maximum uses</span>
                <select value={maxUses} onChange={(event) => setMaxUses(event.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60">
                  <option value="0">Unlimited</option>
                  <option value="1">1 use</option>
                  <option value="5">5 uses</option>
                  <option value="10">10 uses</option>
                  <option value="25">25 uses</option>
                  <option value="50">50 uses</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-ink-400">
                <span>Expires after</span>
                <select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60">
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="never">Never</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus size={14} /> {busy ? 'Working…' : 'Generate invite code'}
            </button>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">Existing invitations</h3>
              <span className="text-[10px] text-ink-600">{invitations.length} / 25</span>
            </div>
            {loading ? <p className="py-6 text-center text-xs text-ink-500">Loading invitations…</p> : null}
            {!loading && invitations.length === 0 ? <p className="rounded-xl border border-dashed border-white/[0.1] px-3 py-7 text-center text-xs text-ink-500">No invitations yet. Generate your first code above.</p> : null}
            {!loading ? invitations.map((invitation) => {
              const inactive = Boolean(invitation.revoked_at) || Boolean(invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) || (invitation.max_uses !== null && invitation.uses >= invitation.max_uses);
              return (
                <article key={invitation.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="break-all text-xs font-semibold tracking-wide text-primary-200">{invitation.code}</code>
                    <span className={'rounded-full px-2 py-1 text-[9px] font-semibold ' + (inactive ? 'bg-white/[0.06] text-ink-500' : 'bg-emerald-400/10 text-emerald-300')}>
                      {invitation.revoked_at ? 'Revoked' : inactive ? 'Expired / used' : 'Active'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-500">
                    <span>{invitation.uses} / {invitation.max_uses ?? '∞'} uses</span>
                    <span>{formatExpiry(invitation.expires_at)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void handleCopy(invitation)} disabled={inactive} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] font-semibold text-ink-300 hover:border-primary-400/30 hover:text-primary-200 disabled:opacity-40">
                      {copiedId === invitation.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === invitation.id ? 'Copied' : 'Copy invite link'}
                    </button>
                    {!inactive ? <button type="button" onClick={() => void handleRevoke(invitation)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/15 px-3 py-2 text-[10px] font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-40"><Trash2 size={12} /> Revoke</button> : null}
                  </div>
                </article>
              );
            }) : null}
          </div>
          <p className="flex items-start gap-2 text-[10px] leading-relaxed text-ink-600"><Shield size={12} className="mt-0.5 shrink-0" /> Anyone with an active invite link can join this server. After opening the link, they can use the prefilled code under Servers.</p>
        </div>
      </section>
    </div>
  );
}
