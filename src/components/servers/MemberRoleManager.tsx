
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Shield, User, X } from 'lucide-react';
import {
  assignCustomRole,
  fetchCustomRoles,
  fetchMemberRoles,
  removeCustomRole,
} from '@/lib/customRolesApi';
import type {
  CustomRole,
  MemberRole,
  MemberWithProfile,
} from '@/types/servers';

interface MemberRoleManagerProps {
  serverId: string;
  member: MemberWithProfile;
  onClose: () => void;
}

export function MemberRoleManager({
  serverId,
  member,
  onClose,
}: MemberRoleManagerProps) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<MemberRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const displayName =
    member.profile?.display_name ||
    member.profile?.username ||
    'Unknown member';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [roleRows, memberRoleRows] = await Promise.all([
          fetchCustomRoles(serverId),
          fetchMemberRoles(serverId),
        ]);

        if (cancelled) return;

        setRoles(roleRows);
        setAssignedRoles(
          memberRoleRows.filter((row) => row.user_id === member.user_id),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load member roles.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [serverId, member.user_id]);

  function hasRole(roleId: string) {
    return assignedRoles.some((row) => row.role_id === roleId);
  }

  async function toggleRole(role: CustomRole) {
    if (busyRoleId) return;

    const currentlyAssigned = hasRole(role.id);

    setBusyRoleId(role.id);
    setError('');

    try {
      if (currentlyAssigned) {
        await removeCustomRole(serverId, member.user_id, role.id);

        setAssignedRoles((current) =>
          current.filter((row) => row.role_id !== role.id),
        );
      } else {
        await assignCustomRole(serverId, member.user_id, role.id);

        setAssignedRoles((current) => [
          ...current,
          {
            server_id: serverId,
            user_id: member.user_id,
            role_id: role.id,
            assigned_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update member roles.',
      );
    } finally {
      setBusyRoleId(null);
    }
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100"
          aria-label="Back to members"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-primary-200">
          {member.profile?.avatar_url ? (
            <img
              src={member.profile.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={19} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-ink-100">
            {displayName}
          </h2>
          <p className="text-xs text-ink-500">
            Manage member roles
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-ink-500 transition hover:bg-white/[0.06] hover:text-ink-100"
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-400">
            Base role
          </h3>

          <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <Shield size={16} className="text-primary-300" />
            <span className="text-sm font-medium text-ink-200">
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </span>
            <span className="ml-auto text-[10px] text-ink-600">
              System role
            </span>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-400">
            Custom roles
          </h3>

          <span className="text-[10px] text-ink-500">
            {assignedRoles.length} assigned
          </span>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
            <Shield size={25} className="mx-auto mb-3 text-ink-600" />
            <p className="text-sm font-medium text-ink-300">
              No custom roles yet
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Create roles in Manage roles first.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {roles.map((role) => {
              const assigned = hasRole(role.id);
              const busy = busyRoleId === role.id;

              return (
                <button
                  key={role.id}
                  type="button"
                  disabled={busyRoleId !== null}
                  onClick={() => void toggleRole(role)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                    assigned
                      ? 'border-primary-400/30 bg-primary-500/[0.08]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-100">
                      {role.icon ? `${role.icon} ` : ''}
                      {role.name}
                    </span>

                    <span className="mt-0.5 block truncate text-[10px] text-ink-500">
                      {role.description || `Position ${role.position}`}
                    </span>
                  </span>

                  {busy ? (
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
                  ) : assigned ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                      <Check size={14} />
                    </span>
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded-full border border-white/15" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        <p className="text-center text-[10px] text-ink-600">
          Changes are saved automatically.
        </p>
      </footer>
    </section>
  );
}
