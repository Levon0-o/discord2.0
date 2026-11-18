import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Hash, Link2, Search, Settings, Shield, Users, X, Plus, Pencil, Trash2, SlidersHorizontal, Lock, Megaphone, Headphones, Server as ServerIconGlyph, Folder, FolderPlus } from 'lucide-react';
import { ServerIcon } from '@/components/servers/ServerIcon';
import { RoleManager } from '@/components/servers/RoleManager';
import { MemberRoleManager } from '@/components/servers/MemberRoleManager';
import { AutoRoleManager } from '@/components/servers/AutoRoleManager';
import { InviteManager } from '@/components/servers/InviteManager';
import { CreateChannelModal } from '@/components/servers/CreateChannelModal';
import { ChannelPermissionsModal } from '@/components/servers/ChannelPermissionsModal';
import { ChannelRolePermissionsModal } from '@/components/servers/ChannelRolePermissionsModal';
import { CategoryPermissionsModal } from '@/components/servers/CategoryPermissionsModal';
import { CategoryRolePermissionsModal } from '@/components/servers/CategoryRolePermissionsModal';
import { fetchChannels, createChannel, updateChannel, deleteChannel, updateServer, fetchChannelCategories, createChannelCategory, renameChannelCategory, deleteChannelCategory } from '@/lib/serversApi';
import type { Channel, CreateChannelInput, MemberWithProfile, ServerWithMeta } from '@/types/servers';

type SettingsTab = 'overview' | 'members' | 'roles' | 'auto-roles' | 'channels' | 'invites';
type ChannelCategory = { id: string; name: string; position: number };

interface ServerSettingsProps {
  server: ServerWithMeta;
  members: MemberWithProfile[];
  channels: Channel[];
  onClose: () => void;
  onServerUpdated: (server: ServerWithMeta) => void;
  onChannelsChanged: (channels: Channel[]) => void;
  onSelectChannel: (channelId: string) => void;
}

const NAV: { id: SettingsTab; label: string; icon: typeof Settings; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: Settings, group: 'SERVER' },
  { id: 'members', label: 'Members', icon: Users, group: 'SERVER' },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield, group: 'ACCESS' },
  { id: 'auto-roles', label: 'Auto Roles', icon: SlidersHorizontal, group: 'ACCESS' },
  { id: 'channels', label: 'Channels & Categories', icon: Folder, group: 'CONTENT' },
  { id: 'invites', label: 'Invites', icon: Link2, group: 'CONTENT' },
];

export function ServerSettings({ server, members, channels: initialChannels, onClose, onServerUpdated, onChannelsChanged, onSelectChannel }: ServerSettingsProps) {
  const [tab, setTab] = useState<SettingsTab>('overview');
  const [localChannels, setLocalChannels] = useState(initialChannels);
  const [channelCategories, setChannelCategories] = useState<ChannelCategory[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryPermissions, setCategoryPermissions] = useState<ChannelCategory | null>(null);
  const [categoryRolePermissions, setCategoryRolePermissions] = useState<ChannelCategory | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithProfile | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description);
  const [visibility, setVisibility] = useState(server.visibility);
  const [themeColor, setThemeColor] = useState(server.theme_color);
  const [iconUrl, setIconUrl] = useState(server.icon_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(server.banner_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editRestricted, setEditRestricted] = useState(false);
  const [editChannelType, setEditChannelType] = useState<'text' | 'announcement' | 'voice'>('text');
  const [editSlowmode, setEditSlowmode] = useState(0);
  const [editBusy, setEditBusy] = useState(false);
  const [permissionsChannel, setPermissionsChannel] = useState<Channel | null>(null);
  const [rolePermissionsChannel, setRolePermissionsChannel] = useState<Channel | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchChannels(server.id), fetchChannelCategories(server.id)]).then(([rows, categories]) => {
      if (!active) return;
      setLocalChannels(rows);
      onChannelsChanged(rows);
      setChannelCategories(categories as ChannelCategory[]);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load channels and categories.');
    });
    return () => { active = false; };
  }, [server.id]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      const label = member.profile?.display_name || member.profile?.username || '';
      return !query || label.toLowerCase().includes(query) || member.profile?.username?.toLowerCase().includes(query);
    });
  }, [members, search]);

  function syncChannels(rows: Channel[]) { setLocalChannels(rows); onChannelsChanged(rows); }

  async function handleServerSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(''); setNotice('');
    if (name.trim().length < 2 || name.trim().length > 60) { setError('Server name must be between 2 and 60 characters.'); return; }
    if (description.length > 500) { setError('Description must be 500 characters or fewer.'); return; }
    if (!/^#[0-9a-fA-F]{6}$/.test(themeColor)) { setError('Choose a valid theme color.'); return; }
    setSaving(true);
    try {
      const updated = await updateServer(server.id, { name: name.trim(), description: description.trim(), visibility, theme_color: themeColor, icon_url: iconUrl.trim() || null, banner_url: bannerUrl.trim() || null });
      onServerUpdated({ ...server, ...updated });
      setNotice('Server settings saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save server settings.'); }
    finally { setSaving(false); }
  }

  async function handleCreateChannel(input: CreateChannelInput) {
    setCreateBusy(true); setCreateError('');
    try {
      await createChannel(input);
      syncChannels(await fetchChannels(server.id));
      setCreateOpen(false);
    } catch (err) { setCreateError(err instanceof Error ? err.message : 'Could not create channel.'); }
    finally { setCreateBusy(false); }
  }

  function openEditor(channel: Channel) {
    setEditingChannel(channel); setEditName(channel.name); setEditTopic(channel.topic); setEditCategory(channel.category);
    setEditRestricted(channel.is_restricted); setEditChannelType(channel.channel_type ?? 'text'); setEditSlowmode(channel.slowmode_seconds ?? 0); setError('');
  }

  async function saveChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingChannel || editBusy) return;
    setEditBusy(true); setError('');
    try {
      await updateChannel(editingChannel.id, { name: editName, topic: editTopic, category: editCategory, is_restricted: editRestricted, slowmode_seconds: editSlowmode, channel_type: editChannelType });
      syncChannels(await fetchChannels(server.id)); setEditingChannel(null); setNotice('Channel updated.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update channel.'); }
    finally { setEditBusy(false); }
  }

  async function removeChannel(channel: Channel) {
    if (!window.confirm('Delete #' + channel.name + '? This also deletes its message history and pins.')) return;
    setDeleteBusyId(channel.id); setError('');
    try {
      await deleteChannel(channel.id); syncChannels(await fetchChannels(server.id)); setNotice('Channel deleted.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete channel.'); }
    finally { setDeleteBusyId(null); }
  }

  const categories = [...new Set([...channelCategories.map((category) => category.name), ...localChannels.map((channel) => channel.category)])];

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (categoryBusy) return;
    setCategoryBusy(true); setError(''); setNotice('');
    try {
      if (editingCategory) await renameChannelCategory(server.id, editingCategory.name, categoryName);
      else await createChannelCategory(server.id, categoryName);
      const [nextCategories, nextChannels] = await Promise.all([fetchChannelCategories(server.id), fetchChannels(server.id)]);
      setChannelCategories(nextCategories as ChannelCategory[]); syncChannels(nextChannels); setEditingCategory(null); setCategoryName(''); setCategoryFormOpen(false); setNotice(editingCategory ? 'Category renamed.' : 'Category created.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save category.'); }
    finally { setCategoryBusy(false); }
  }

  async function removeCategory(category: ChannelCategory) {
    if (!window.confirm('Delete category “' + category.name + '”? Its channels will be moved to General.')) return;
    setCategoryBusy(true); setError('');
    try {
      await deleteChannelCategory(server.id, category.name);
      const [nextCategories, nextChannels] = await Promise.all([fetchChannelCategories(server.id), fetchChannels(server.id)]);
      setChannelCategories(nextCategories as ChannelCategory[]); syncChannels(nextChannels); setNotice('Category deleted.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete category.'); }
    finally { setCategoryBusy(false); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Back to server"><ArrowLeft size={17} /></button>
        <ServerIcon name={server.name} iconUrl={server.icon_url} themeColor={server.theme_color} size="sm" />
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-300">Server settings</p><h1 className="truncate text-sm font-bold text-ink-100">{server.name}</h1></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-500 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close settings"><X size={17} /></button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-white/[0.07] bg-ink-900/50 p-3 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2 px-2 py-2"><ServerIconGlyph size={15} className="text-primary-300" /><span className="truncate text-xs font-bold text-ink-200">{server.name}</span></div>
          {(['SERVER', 'ACCESS', 'CONTENT'] as const).map((group) => (
            <div key={group} className="mb-4">
              <p className="mb-1 px-2 text-[9px] font-bold tracking-[0.18em] text-ink-600">{group}</p>
              {NAV.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon; const active = tab === item.id;
                return <button key={item.id} type="button" onClick={() => { setTab(item.id); setSelectedMember(null); setError(''); setNotice(''); }} className={'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ' + (active ? 'bg-primary-500/15 text-primary-200' : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100')}><Icon size={14} />{item.label}</button>;
              })}
            </div>
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
          {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

          {tab === 'overview' && (
            <section className="mx-auto max-w-2xl space-y-5">
              <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">Server configuration</p><h2 className="mt-1 text-2xl font-bold text-ink-50">Overview</h2><p className="mt-2 text-sm text-ink-400">Manage your server identity and visibility.</p></header>
              <form onSubmit={(event) => void handleServerSave(event)} className="space-y-4 rounded-2xl border border-white/[0.08] bg-ink-900/60 p-4 sm:p-5">
                <label className="block space-y-1.5 text-xs text-ink-400"><span>Server name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /></label>
                <label className="block space-y-1.5 text-xs text-ink-400"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} className="w-full resize-y rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs text-ink-400"><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50"><option value="public">Public</option><option value="private">Private</option></select></label>
                  <label className="space-y-1.5 text-xs text-ink-400"><span>Theme color</span><div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-ink-950 p-2"><input type="color" value={themeColor} onChange={(event) => setThemeColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" /><input value={themeColor} onChange={(event) => setThemeColor(event.target.value)} maxLength={7} className="min-w-0 flex-1 bg-transparent px-1 text-sm text-ink-100 outline-none" /></div></label>
                </div>
                <label className="block space-y-1.5 text-xs text-ink-400"><span>Icon image URL</span><input type="url" value={iconUrl} onChange={(event) => setIconUrl(event.target.value)} placeholder="https://…" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /></label>
                <label className="block space-y-1.5 text-xs text-ink-400"><span>Banner image URL</span><input type="url" value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="https://…" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /></label>
                <div className="flex justify-end border-t border-white/[0.06] pt-4"><button type="submit" disabled={saving} className="rounded-xl bg-primary-500 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div>
              </form>
              <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-ink-500">Members</p><p className="mt-1 text-xl font-bold text-ink-100">{members.length}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-ink-500">Channels</p><p className="mt-1 text-xl font-bold text-ink-100">{localChannels.length}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-ink-500">Created</p><p className="mt-1 text-sm font-bold text-ink-100">{new Date(server.created_at).toLocaleDateString()}</p></div></div>
            </section>
          )}

          {tab === 'members' && (selectedMember ? <MemberRoleManager serverId={server.id} member={selectedMember} onClose={() => setSelectedMember(null)} /> : (
            <section className="space-y-4"><header><h2 className="text-2xl font-bold text-ink-50">Members</h2><p className="mt-1 text-sm text-ink-400">Browse server members and manage their custom roles.</p></header>
              <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members…" className="w-full rounded-xl border border-white/[0.08] bg-ink-900 py-3 pl-9 pr-3 text-sm text-ink-100 outline-none focus:border-primary-400/50" /></div>
              <div className="space-y-1">{filteredMembers.map((member) => { const label = member.profile?.display_name || member.profile?.username || 'Unknown member'; return <button key={member.user_id} type="button" disabled={member.user_id === server.owner_id} onClick={() => setSelectedMember(member)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:border-primary-400/20 hover:bg-primary-500/[0.04] disabled:opacity-60">{member.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500/15 text-sm font-bold text-primary-200">{label.slice(0,1).toUpperCase()}</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink-100">{label}</span><span className="block text-[11px] text-ink-500">@{member.profile?.username ?? 'unknown'} · {member.role}</span></span><Shield size={15} className="text-ink-500" /></button>; })}</div>
              {filteredMembers.length === 0 && <p className="py-8 text-center text-sm text-ink-500">No members found.</p>}
            </section>
          ))}

          {tab === 'roles' && <RoleManager serverId={server.id} onBack={() => setTab('overview')} />}
          {tab === 'auto-roles' && <AutoRoleManager serverId={server.id} />}

          {tab === 'channels' && (
            <section className="space-y-4">
              <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold text-ink-50">Channels &amp; Categories</h2><p className="mt-1 text-sm text-ink-400">Manage channels, category structure and inherited permissions in one place.</p></div><button type="button" onClick={() => { setCreateError(''); setCreateOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-primary-400"><Plus size={14} />Create channel</button></header>
              <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-ink-100">Categories</h3><p className="mt-0.5 text-xs text-ink-500">Organize channels and configure category-wide access.</p></div><button type="button" onClick={() => { setEditingCategory(null); setCategoryName(''); setCategoryFormOpen(true); setError(''); }} className="inline-flex items-center gap-2 rounded-lg border border-primary-400/20 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/10"><FolderPlus size={14}/>Add category</button></div>{channelCategories.map((category) => <div key={category.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-ink-950/60 p-3"><Folder size={16} className="text-primary-300"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-100">{category.name}</p><p className="text-[11px] text-ink-500">{localChannels.filter((channel) => channel.category === category.name).length} channels</p></div><button type="button" onClick={() => setCategoryPermissions(category)} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Member permissions"><Users size={15}/></button><button type="button" onClick={() => setCategoryRolePermissions(category)} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Role permissions"><Shield size={15}/></button><button type="button" onClick={() => { setEditingCategory(category); setCategoryName(category.name); setCategoryFormOpen(true); }} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Rename category"><Pencil size={15}/></button><button type="button" disabled={categoryBusy} onClick={() => void removeCategory(category)} className="rounded-lg p-2 text-ink-500 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50" title="Delete category"><Trash2 size={15}/></button></div>)}{channelCategories.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-ink-500">No categories yet. Add one to organize your channels.</p>}</div>{categoryFormOpen && <form onSubmit={(event) => void saveCategory(event)} className="flex flex-wrap items-end gap-2 rounded-xl border border-primary-400/20 bg-primary-500/[0.04] p-3"><label className="min-w-[180px] flex-1 space-y-1 text-xs text-ink-400">{editingCategory ? 'Category name' : 'New category name'}<input autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required maxLength={40} placeholder="e.g. Community" className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/50"/></label><button type="submit" disabled={categoryBusy} className="rounded-lg bg-primary-500 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{categoryBusy ? 'Saving…' : editingCategory ? 'Save name' : 'Create category'}</button><button type="button" onClick={() => { setEditingCategory(null); setCategoryName(''); setCategoryFormOpen(false); }} className="rounded-lg border border-white/10 px-3 py-2.5 text-xs text-ink-300">Cancel</button></form>}{categories.map((category) => <div key={category} className="space-y-2"><p className="px-1 text-[10px] font-bold uppercase tracking-widest text-ink-500">{category}</p>{localChannels.filter((channel) => channel.category === category).map((channel) => <article key={channel.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-ink-400">{channel.is_restricted ? <Lock size={16} /> : channel.channel_type === 'announcement' ? <Megaphone size={16} /> : channel.channel_type === 'voice' ? <Headphones size={16} /> : <Hash size={16} />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-100">{channel.channel_type === 'voice' ? channel.name : '#' + channel.name}</p><p className="mt-0.5 truncate text-xs text-ink-500">{channel.topic || 'No channel topic'} · {channel.channel_type === 'announcement' ? 'Announcement' : channel.channel_type === 'voice' ? 'Voice' : 'Text'} · {channel.channel_type === 'voice' ? 'Live audio/video room' : 'Slowmode: ' + (channel.slowmode_seconds || 'Off')}</p></div><button type="button" onClick={() => onSelectChannel(channel.id)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] font-semibold text-ink-300 hover:bg-white/[0.05]">Open</button><button type="button" onClick={() => setPermissionsChannel(channel)} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Member permissions"><SlidersHorizontal size={15} /></button><button type="button" onClick={() => setRolePermissionsChannel(channel)} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Role permissions"><Shield size={15} /></button><button type="button" onClick={() => openEditor(channel)} className="rounded-lg p-2 text-ink-500 hover:bg-white/[0.05] hover:text-primary-300" title="Edit channel"><Pencil size={15} /></button><button type="button" disabled={deleteBusyId === channel.id} onClick={() => void removeChannel(channel)} className="rounded-lg p-2 text-ink-500 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50" title="Delete channel"><Trash2 size={15} /></button></article>)}</div>)}
              {localChannels.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-500">No channels yet. Create your first channel.</div>}
            </section>
          )}

          {tab === 'invites' && <section className="space-y-3"><header><h2 className="text-2xl font-bold text-ink-50">Invites</h2><p className="mt-1 text-sm text-ink-400">Create, copy and revoke invitation links for this server.</p></header><InviteManager serverId={server.id} serverName={server.name} embedded onClose={() => setTab('overview')} /></section>}
        </main>
      </div>

      <CreateChannelModal open={createOpen} busy={createBusy} error={createError} serverId={server.id} defaultPosition={localChannels.length ? Math.max(...localChannels.map((channel) => channel.position)) + 1 : 0} categories={categories} onClose={() => { if (!createBusy) setCreateOpen(false); }} onSubmit={handleCreateChannel} />
      {editingChannel && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"><form onSubmit={(event) => void saveChannel(event)} className="w-full max-w-md space-y-4 rounded-2xl border border-white/[0.08] bg-ink-900 p-5"><div><h3 className="text-lg font-semibold text-ink-50">Edit channel</h3><p className="mt-1 text-xs text-ink-500">Update channel details and behavior.</p></div><label className="block space-y-1 text-xs text-ink-400">Channel name<input value={editName} onChange={(event) => setEditName(event.target.value.toLowerCase())} required maxLength={50} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100" /></label><label className="block space-y-1 text-xs text-ink-400">Topic<input value={editTopic} onChange={(event) => setEditTopic(event.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100" /></label><label className="block space-y-1 text-xs text-ink-400">Channel type<select value={editChannelType} onChange={(event) => setEditChannelType(event.target.value as 'text' | 'announcement' | 'voice' | 'voice')} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100"><option value="text">Text</option><option value="announcement">Announcement</option><option value="voice">Voice</option></select></label><label className="block space-y-1 text-xs text-ink-400">Category<input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} required maxLength={40} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100" /></label><label className="flex items-center gap-2 text-xs text-ink-300"><input type="checkbox" checked={editRestricted} onChange={(event) => setEditRestricted(event.target.checked)} />Restricted channel — hidden from regular members by default; custom roles can be granted access</label><label className="block space-y-1 text-xs text-ink-400">Slowmode<select value={editSlowmode} onChange={(event) => setEditSlowmode(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100"><option value={0}>Off</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={300}>5 minutes</option><option value={3600}>1 hour</option></select></label><div className="flex gap-2"><button type="button" onClick={() => setEditingChannel(null)} className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-300">Cancel</button><button type="submit" disabled={editBusy} className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{editBusy ? 'Saving…' : 'Save changes'}</button></div></form></div>}
      {permissionsChannel && <ChannelPermissionsModal channelId={permissionsChannel.id} channelName={permissionsChannel.name} members={members} onClose={() => setPermissionsChannel(null)} />}
      {rolePermissionsChannel && <ChannelRolePermissionsModal serverId={server.id} channelId={rolePermissionsChannel.id} channelName={rolePermissionsChannel.name} onClose={() => setRolePermissionsChannel(null)} />}
      {categoryPermissions && <CategoryPermissionsModal categoryId={categoryPermissions.id} categoryName={categoryPermissions.name} members={members} onClose={() => setCategoryPermissions(null)} />}
      {categoryRolePermissions && <CategoryRolePermissionsModal serverId={server.id} categoryId={categoryRolePermissions.id} categoryName={categoryRolePermissions.name} onClose={() => setCategoryRolePermissions(null)} />}
    </div>
  );
}
