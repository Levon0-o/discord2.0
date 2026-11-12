
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Plus,
  Shield,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  createCustomRole,
  deleteCustomRole,
  fetchCustomRoles,
  updateCustomRole,
} from '@/lib/customRolesApi';
import type {
  CustomRole,
  ServerPermission,
  ServerPermissions,
} from '@/types/servers';

interface RoleManagerProps {
  serverId: string;
  onBack: () => void;
}

const PERMISSIONS: { key: ServerPermission; label: string; description: string }[] = [
  { key: 'manage_server', label: 'Manage server', description: 'Manage server settings.' },
  { key: 'manage_channels', label: 'Manage channels', description: 'Create and manage channels.' },
  { key: 'manage_members', label: 'Manage members', description: 'Manage server members.' },
  { key: 'manage_invites', label: 'Manage invitations', description: 'Create and manage invitations.' },
  { key: 'manage_roles', label: 'Manage roles', description: 'Create and manage custom roles.' },
  { key: 'moderate_messages', label: 'Moderate messages', description: 'Moderate messages and members.' },
  { key: 'manage_messages', label: 'Manage messages', description: 'Manage other members’ messages.' },
  { key: 'view_restricted_channels', label: 'View restricted channels', description: 'Access restricted channels.' },
];

const DEFAULT_COLOR = '#3987ff';

export function RoleManager({ serverId, onBack }: RoleManagerProps) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState('100');
  const [permissions, setPermissions] = useState<ServerPermissions>({});

  async function loadRoles() {
    setLoading(true);
    setError('');

    try {
      const result = await fetchCustomRoles(serverId);
      setRoles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load roles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, [serverId]);

  function openCreate() {
    setEditingRole(null);
    setName('');
    setColor(DEFAULT_COLOR);
    setIcon('');
    setDescription('');
    setPosition('100');
    setPermissions({});
    setError('');
    setEditorOpen(true);
  }

  function openEdit(role: CustomRole) {
    setEditingRole(role);
    setName(role.name);
    setColor(role.color);
    setIcon(role.icon ?? '');
    setDescription(role.description);
    setPosition(String(role.position));
    setPermissions(role.permissions ?? {});
    setError('');
    setEditorOpen(true);
  }

  function togglePermission(permission: ServerPermission) {
    setPermissions((current) => ({
      ...current,
      [permission]: current[permission] !== true,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    const numericPosition = Number(position);

    if (normalizedName.length < 1 || normalizedName.length > 40) {
      setError('Role name must be between 1 and 40 characters.');
      return;
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      setError('Choose a valid hexadecimal color.');
      return;
    }

    if (!Number.isInteger(numericPosition) || numericPosition < 1 || numericPosition > 999) {
      setError('Position must be a whole number between 1 and 999.');
      return;
    }

    setSaving(true);

    try {
      if (editingRole) {
        await updateCustomRole(editingRole.id, {
          name: normalizedName,
          color,
          icon: icon.trim() || null,
          description: normalizedDescription,
          position: numericPosition,
          permissions,
        });
      } else {
        await createCustomRole({
          server_id: serverId,
          name: normalizedName,
          color,
          icon: icon.trim() || null,
          description: normalizedDescription,
          position: numericPosition,
          permissions,
        });
      }

      setEditorOpen(false);
      setEditingRole(null);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save role.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: CustomRole) {
    const confirmed = window.confirm(
      `Delete the "${role.name}" role? Members will lose this role.`,
    );

    if (!confirmed) return;

    setError('');

    try {
      await deleteCustomRole(role.id);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete role.');
    }
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Back to server"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-50">Role management</h2>
            <p className="text-xs text-ink-500">
              Create and configure server roles.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-400"
        >
          <Plus size={15} />
          Create role
        </button>
      </header>

      {error && !editorOpen && (
        <p role="alert" className="mx-4 mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10">
              <Shield size={25} className="text-primary-300" />
            </div>
            <h3 className="font-semibold text-ink-100">No custom roles yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-500">
              Create roles such as VIP, Support, Developer or Event Manager.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
            >
              Create your first role
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                Custom roles
              </p>
              <span className="text-xs text-ink-500">{roles.length} roles</span>
            </div>

            {roles.map((role) => (
              <article
                key={role.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-ink-950/40 p-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                  style={{
                    backgroundColor: `${role.color}20`,
                    color: role.color,
                    border: `1px solid ${role.color}45`,
                  }}
                >
                  {role.icon || role.name.slice(0, 1).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold" style={{ color: role.color }}>
                      {role.name}
                    </h3>
                    <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-ink-500">
                      Position {role.position}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {role.description || 'No description'}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-600">
                    {Object.values(role.permissions ?? {}).filter(Boolean).length} permissions enabled
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(role)}
                    title="Edit role"
                    className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.07] hover:text-white"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(role)}
                    title="Delete role"
                    className="rounded-lg p-2 text-ink-500 transition hover:bg-red-400/10 hover:text-red-300"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-ink-900 shadow-2xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] p-4">
              <div>
                <h3 className="font-semibold text-ink-50">
                  {editingRole ? 'Edit role' : 'Create role'}
                </h3>
                <p className="text-xs text-ink-500">
                  Configure the role identity and permissions.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditorOpen(false)}
                className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={(event) => void handleSubmit(event)} className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-ink-300">Role name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={40}
                    required
                    placeholder="e.g. VIP"
                    className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-300">Role color</span>
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-ink-950 p-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
                    />
                    <input
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      maxLength={7}
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-300">Icon or emoji</span>
                  <input
                    value={icon}
                    onChange={(event) => setIcon(event.target.value)}
                    maxLength={8}
                    placeholder="e.g. ★"
                    className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-ink-300">Description</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={200}
                    placeholder="What is this role for?"
                    className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-ink-300">
                    Hierarchy position (1–999)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    required
                    className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/60"
                  />
                  <span className="mt-1 block text-[11px] text-ink-600">
                    Higher numbers mean a higher role in the hierarchy.
                  </span>
                </label>
              </div>

              <div className="mt-6">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-ink-100">Permissions</h4>
                  <p className="text-xs text-ink-500">Choose what members with this role can do.</p>
                </div>

                <div className="space-y-2">
                  {PERMISSIONS.map((permission) => {
                    const enabled = permissions[permission.key] === true;

                    return (
                      <button
                        key={permission.key}
                        type="button"
                        onClick={() => togglePermission(permission.key)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                          enabled
                            ? 'border-primary-400/30 bg-primary-500/[0.08]'
                            : 'border-white/[0.06] bg-ink-950/40 hover:bg-white/[0.03]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                            enabled
                              ? 'border-primary-400 bg-primary-500 text-white'
                              : 'border-white/20 text-transparent',
                          )}
                        >
                          <Check size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-ink-200">
                            {permission.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-ink-500">
                            {permission.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-6 flex gap-2 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditorOpen(false)}
                  className="flex-1 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-ink-300 hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingRole ? 'Save changes' : 'Create role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
