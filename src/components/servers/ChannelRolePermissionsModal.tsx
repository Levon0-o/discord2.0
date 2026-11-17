import { useEffect, useState } from 'react';
import { Shield, X } from 'lucide-react';
import { fetchChannelRolePermissions, setChannelRolePermission, type ChannelRolePermission, type ChannelRolePermissionKey } from '@/lib/serversApi';
import { fetchCustomRoles } from '@/lib/customRolesApi';
import type { CustomRole } from '@/types/servers';

interface Props { serverId: string; channelId: string; channelName: string; onClose: () => void; }
const PERMISSIONS: { key: ChannelRolePermissionKey; label: string; description: string }[] = [
  { key: 'can_view', label: 'View', description: 'See this channel' },
  { key: 'can_send_messages', label: 'Send', description: 'Write messages' },
  { key: 'can_attach_files', label: 'Files', description: 'Upload attachments' },
  { key: 'can_manage_messages', label: 'Manage', description: 'Moderate messages' },
];
const valueOf = (value: boolean | null | undefined) => value == null ? 'inherit' : value ? 'allow' : 'deny';

export function ChannelRolePermissionsModal({ serverId, channelId, channelName, onClose }: Props) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rows, setRows] = useState<Record<string, ChannelRolePermission>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([fetchCustomRoles(serverId), fetchChannelRolePermissions(channelId)])
      .then(([loadedRoles, permissions]) => {
        if (!active) return;
        setRoles(loadedRoles);
        setRows(Object.fromEntries(permissions.map((row) => [row.role_id, row])));
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Could not load role permissions.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [serverId, channelId]);

  async function update(role: CustomRole, key: ChannelRolePermissionKey, value: boolean | null) {
    setBusy(role.id + key); setError('');
    try {
      const row = await setChannelRolePermission(channelId, serverId, role.id, key, value);
      setRows((current) => {
        const next = { ...current };
        if ([row.can_view, row.can_send_messages, row.can_attach_files, row.can_manage_messages].every((item) => item === null)) delete next[role.id];
        else next[role.id] = row;
        return next;
      });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save role permission.'); }
    finally { setBusy(''); }
  }

  return <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-3 sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="channel-role-permissions-title" className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 shadow-2xl">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] p-4 sm:p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300"><Shield size={19} /></div><div className="min-w-0 flex-1"><h2 id="channel-role-permissions-title" className="truncate text-base font-semibold text-ink-50">Role permissions</h2><p className="mt-0.5 text-xs text-ink-400">#{channelName} · applies to every member assigned this role</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close"><X size={18} /></button></header>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5"><div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs leading-relaxed text-ink-400"><strong className="text-ink-200">Inherit</strong> uses category and server defaults. <strong className="text-emerald-300">Allow</strong> grants access and <strong className="text-red-300">Deny</strong> blocks it. Member-specific channel overrides take priority. If a member has multiple assigned roles, an explicit Deny takes priority over Allow.</div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-400/10 p-3 text-xs text-red-300">{error}</p>}
        {loading ? <div className="py-12 text-center text-sm text-ink-500">Loading role permissions…</div> : <div className="min-w-[680px]">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(105px,1fr))] gap-2 border-b border-white/[0.07] px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500"><span>Role</span>{PERMISSIONS.map((p) => <span key={p.key} title={p.description}>{p.label}</span>)}</div>
          <div className="divide-y divide-white/[0.05]">{roles.map((role) => { const row = rows[role.id]; return <div key={role.id} className="grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(105px,1fr))] items-center gap-2 px-2 py-3"><div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-ink-100">{role.name}</p><p className="truncate text-[10px] text-ink-500">{role.description || 'Custom server role'}</p></div></div>{PERMISSIONS.map((p) => <select key={p.key} aria-label={p.label + ' permission for ' + role.name} value={valueOf(row?.[p.key])} disabled={busy !== ''} onChange={(event) => void update(role, p.key, event.target.value === 'inherit' ? null : event.target.value === 'allow')} className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-2 py-2 text-xs text-ink-200 outline-none focus:border-primary-400/50 disabled:opacity-50"><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select>)}</div>; })}</div>
          {roles.length === 0 && <p className="py-8 text-center text-xs text-ink-500">No custom roles yet. Create roles in Server Settings → Roles & Permissions.</p>}
        </div>}
      </div><footer className="shrink-0 border-t border-white/[0.07] px-4 py-3 text-right"><button type="button" onClick={onClose} className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-400">Done</button></footer>
    </section>
  </div>;
}