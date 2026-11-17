import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Shield, Trash2, ToggleLeft, ToggleRight, Clock3 } from 'lucide-react';
import { fetchAutoRoleRules, fetchCustomRoles, createAutoRoleRule, updateAutoRoleRule, deleteAutoRoleRule } from '@/lib/customRolesApi';
import type { AutoRoleEventType, AutoRoleRule, CustomRole } from '@/types/servers';

interface AutoRoleManagerProps { serverId: string; }

export function AutoRoleManager({ serverId }: AutoRoleManagerProps) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rules, setRules] = useState<AutoRoleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [roleId, setRoleId] = useState('');
  const [eventType, setEventType] = useState<AutoRoleEventType>('join');
  const [minDays, setMinDays] = useState('30');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [roleRows, ruleRows] = await Promise.all([fetchCustomRoles(serverId), fetchAutoRoleRules(serverId)]);
      setRoles(roleRows);
      setRules(ruleRows);
      setRoleId((current) => current || roleRows[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load automatic role rules.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [serverId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleId || saving) return;
    const days = Number(minDays);
    if (eventType === 'account_age' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      setError('Account age must be between 1 and 3650 days.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createAutoRoleRule({
        server_id: serverId,
        role_id: roleId,
        event_type: eventType,
        conditions: eventType === 'account_age' ? { min_days: days } : {},
        is_enabled: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the rule.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutoRoleRule) {
    setError('');
    try {
      const updated = await updateAutoRoleRule(rule.id, { is_enabled: !rule.is_enabled });
      setRules((current) => current.map((item) => item.id === rule.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the rule.');
    }
  }

  async function removeRule(rule: AutoRoleRule) {
    if (!window.confirm('Delete this automatic role rule?')) return;
    setError('');
    try {
      await deleteAutoRoleRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the rule.');
    }
  }

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? 'Deleted role';

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">Server automation</p>
        <h2 className="mt-1 text-2xl font-bold text-ink-50">Auto Roles</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">Automatically assign custom roles when someone joins your server. Rules are enforced by the database, including joins through invitation links.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form onSubmit={(event) => void handleCreate(event)} className="space-y-4 rounded-2xl border border-white/[0.08] bg-ink-900/60 p-4 sm:p-5">
        <div className="flex items-center gap-2"><Plus size={17} className="text-primary-300" /><h3 className="text-sm font-semibold text-ink-100">Create an automatic role rule</h3></div>
        {roles.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-ink-400">Create a custom role in <strong className="text-ink-200">Roles & Permissions</strong> before adding an automatic rule.</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-ink-400"><span>Role to assign</span>
                <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50">
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-ink-400"><span>When should it apply?</span>
                <select value={eventType} onChange={(event) => setEventType(event.target.value as AutoRoleEventType)} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50">
                  <option value="join">When a member joins</option>
                  <option value="account_age">When account is at least this old</option>
                </select>
              </label>
            </div>
            {eventType === 'account_age' && <label className="block max-w-xs space-y-1.5 text-xs text-ink-400"><span>Minimum account age (days)</span><input type="number" min="1" max="3650" value={minDays} onChange={(event) => setMinDays(event.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /><span className="block text-[11px] text-ink-600">The account must meet this age when the member joins.</span></label>}
            <button type="submit" disabled={saving || !roleId || loading} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50"><Plus size={14} />{saving ? 'Creating…' : 'Add rule'}</button>
          </>
        )}
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-ink-100">Active rules</h3><span className="text-xs text-ink-500">{rules.length} rules</span></div>
        {loading ? <div className="py-10 text-center text-sm text-ink-500">Loading rules…</div> : rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center"><Shield size={25} className="mx-auto mb-3 text-ink-600" /><p className="text-sm font-medium text-ink-300">No automatic rules yet</p><p className="mt-1 text-xs text-ink-500">Create a rule above to assign roles automatically.</p></div>
        ) : rules.map((rule) => (
          <article key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300">{rule.event_type === 'join' ? <Shield size={18} /> : <Clock3 size={18} />}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-100">{roleName(rule.role_id)}</p><p className="mt-0.5 text-xs text-ink-500">{rule.event_type === 'join' ? 'Assign when a member joins' : 'Assign on join if account is at least ' + String(rule.conditions.min_days ?? '?') + ' days old'}</p></div>
            <button type="button" onClick={() => void toggleRule(rule)} title={rule.is_enabled ? 'Disable rule' : 'Enable rule'} className={rule.is_enabled ? 'text-primary-300' : 'text-ink-600'}>{rule.is_enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button>
            <button type="button" onClick={() => void removeRule(rule)} title="Delete rule" className="rounded-lg p-2 text-ink-500 transition hover:bg-red-400/10 hover:text-red-300"><Trash2 size={15} /></button>
          </article>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-ink-600">Automatic rules run when a member joins. Existing members are not retroactively changed. Account age is checked at the moment of joining.</p>
    </section>
  );
}
