import { useEffect, useState } from 'react';
import { Shield, X } from 'lucide-react';
import {
  fetchChannelMemberPermissions,
  setChannelMemberPermission,
  type ChannelMemberPermission,
  type ChannelMemberPermissionKey,
} from '@/lib/serversApi';
import type { MemberWithProfile } from '@/types/servers';

interface ChannelPermissionsModalProps {
  channelId: string;
  channelName: string;
  members: MemberWithProfile[];
  onClose: () => void;
}

const PERMISSIONS: {
  key: ChannelMemberPermissionKey;
  label: string;
  description: string;
}[] = [
  { key: 'can_view', label: 'View', description: 'See this channel' },
  { key: 'can_send_messages', label: 'Send', description: 'Write messages' },
  { key: 'can_attach_files', label: 'Files', description: 'Upload attachments' },
  { key: 'can_manage_messages', label: 'Manage', description: 'Moderate others’ messages' },
];

function permissionValue(value: boolean | null | undefined): string {
  return value === null || value === undefined ? 'inherit' : value ? 'allow' : 'deny';
}

export function ChannelPermissionsModal({
  channelId,
  channelName,
  members,
  onClose,
}: ChannelPermissionsModalProps) {
  const [rows, setRows] = useState<Record<string, ChannelMemberPermission>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetchChannelMemberPermissions(channelId).then((permissions) => {
      if (!active) return;
      setRows(Object.fromEntries(permissions.map((row) => [row.user_id, row])));
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load channel permissions.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [channelId]);

  async function updatePermission(member: MemberWithProfile, key: ChannelMemberPermissionKey, value: boolean | null) {
    const id = `${member.user_id}:${key}`;
    const previous = rows[member.user_id];
    setBusyKey(id);
    setError('');
    try {
      const updated = await setChannelMemberPermission(channelId, member.user_id, key, value);
      setRows((current) => ({ ...current, [member.user_id]: updated }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save permission.');
      if (previous) setRows((current) => ({ ...current, [member.user_id]: previous }));
    } finally {
      setBusyKey('');
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="channel-permissions-title" className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] p-4 sm:p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300"><Shield size={19} /></div>
          <div className="min-w-0 flex-1">
            <h2 id="channel-permissions-title" className="truncate text-base font-semibold text-ink-50">Channel permissions</h2>
            <p className="mt-0.5 text-xs text-ink-400">#{channelName} · overrides apply only to this channel</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
          <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs leading-relaxed text-ink-400">
            <strong className="text-ink-200">Inherit</strong> uses the member’s server role. <strong className="text-emerald-300">Allow</strong> grants the permission and <strong className="text-red-300">Deny</strong> blocks it. Server owners and administrators retain channel management access.
          </div>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-400/10 p-3 text-xs text-red-300">{error}</p>}
          {loading ? (
            <div className="py-12 text-center text-sm text-ink-500">Loading permissions…</div>
          ) : (
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(105px,1fr))] gap-2 border-b border-white/[0.07] px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                <span>Member</span>
                {PERMISSIONS.map((permission) => <span key={permission.key} title={permission.description}>{permission.label}</span>)}
              </div>
              <div className="divide-y divide-white/[0.05]">
                {members.map((member) => {
                  const label = member.profile?.display_name || member.profile?.username || 'Unknown member';
                  const row = rows[member.user_id];
                  return (
                    <div key={member.user_id} className="grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(105px,1fr))] items-center gap-2 px-2 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/15 text-xs font-semibold text-primary-200">
                          {member.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : label.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink-100">{label}</p>
                          <p className="truncate text-[10px] text-ink-500">{member.profile?.username ? `@${member.profile.username} · ` : ''}{member.role}</p>
                        </div>
                      </div>
                      {PERMISSIONS.map((permission) => {
                        const value = row?.[permission.key] ?? null;
                        return (
                          <select
                            key={permission.key}
                            aria-label={`${permission.label} permission for ${label}`}
                            value={permissionValue(value)}
                            disabled={busyKey !== ''}
                            onChange={(event) => {
                              const next = event.target.value === 'inherit' ? null : event.target.value === 'allow';
                              void updatePermission(member, permission.key, next);
                            }}
                            className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-2 py-2 text-xs text-ink-200 outline-none focus:border-primary-400/50 disabled:opacity-50"
                          >
                            <option value="inherit">Inherit</option>
                            <option value="allow">Allow</option>
                            <option value="deny">Deny</option>
                          </select>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {members.length === 0 && <p className="py-8 text-center text-xs text-ink-500">No server members found.</p>}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-white/[0.07] px-4 py-3 text-right">
          <button type="button" onClick={onClose} className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-400">Done</button>
        </footer>
      </section>
    </div>
  );
}
