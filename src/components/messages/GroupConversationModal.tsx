import { useEffect, useState, type FormEvent } from 'react';
import { Check, Loader2, Plus, Users, X, UserMinus, LogOut, Pencil } from 'lucide-react';
import { fetchFriends } from '@/lib/friendsApi';
import type { FriendWithProfile } from '@/lib/friendsApi';
import {
  addGroupConversationMember,
  createGroupConversation,
  leaveGroupConversation,
  removeGroupConversationMember,
  renameGroupConversation,
  type DirectConversation,
  type DirectConversationMember,
} from '@/lib/directMessagesApi';
import type { ProfileLite } from '@/types/servers';

interface GroupConversationModalProps {
  mode: 'create' | 'manage';
  conversation?: DirectConversation;
  members?: DirectConversationMember[];
  profiles: Record<string, ProfileLite>;
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  onUpdated: () => void;
  onLeft: () => void;
}

export function GroupConversationModal({
  mode,
  conversation,
  members = [],
  profiles,
  currentUserId,
  onClose,
  onCreated,
  onUpdated,
  onLeft,
}: GroupConversationModalProps) {
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState(conversation?.title ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isCreator = conversation?.created_by === currentUserId;
  const memberIds = new Set(members.map((member) => member.user_id));
  const availableFriends = friends.filter(({ profile }) => !memberIds.has(profile.id));

  useEffect(() => {
    let active = true;
    void fetchFriends()
      .then((rows) => { if (active) setFriends(rows); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load friends.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggleSelected(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIds.length < 2) {
      setError('Select at least two friends.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const id = await createGroupConversation(selectedIds, title);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!conversation) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await renameGroupConversation(conversation.id, title);
      setNotice('Group name updated.');
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename group.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(userId: string) {
    if (!conversation) return;
    setSaving(true);
    setError('');
    try {
      await addGroupConversationMember(conversation.id, userId);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!conversation) return;
    setSaving(true);
    setError('');
    try {
      await removeGroupConversationMember(conversation.id, userId);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLeave() {
    if (!conversation || !window.confirm('Leave this group conversation?')) return;
    setSaving(true);
    setError('');
    try {
      await leaveGroupConversation(conversation.id);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave group.');
    } finally {
      setSaving(false);
    }
  }

  function displayName(profile?: ProfileLite) {
    return profile?.display_name || profile?.username || 'AFTERDARK member';
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.08] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300">
              <Users size={19} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-50">
                {mode === 'create' ? 'Create a group' : 'Group settings'}
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                {mode === 'create' ? 'Start a conversation with your friends' : 'Manage members and group details'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={19} />
          </button>
        </header>

        {(error || notice) && (
          <p role={error ? 'alert' : 'status'} className={`mx-5 mt-4 rounded-lg px-3 py-2 text-sm ${error ? 'border border-red-400/20 bg-red-400/10 text-red-300' : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>
            {error || notice}
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-400">Group name <span className="font-normal normal-case text-ink-600">· optional</span></span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="e.g. Weekend crew" className="w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
              </label>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Choose friends</span>
                  <span className="text-xs tabular-nums text-primary-300">{selectedIds.length} selected · minimum 2</span>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" /> Loading friends…</div>
                ) : friends.length === 0 ? (
                  <p className="rounded-xl bg-ink-900 px-4 py-8 text-center text-sm text-ink-500">Add some friends before creating a group.</p>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/[0.08] bg-ink-900/60 p-2">
                    {friends.map(({ profile }) => {
                      const selected = selectedIds.includes(profile.id);
                      return (
                        <button key={profile.id} type="button" onClick={() => toggleSelected(profile.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${selected ? 'bg-primary-500/15' : 'hover:bg-white/[0.05]'}`}>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-xs font-bold text-primary-200">
                            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName(profile).slice(0, 1).toUpperCase()}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-200">{displayName(profile)}</span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-primary-400 bg-primary-500 text-white' : 'border-white/20 text-transparent'}`}><Check size={13} /></span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-ink-300 hover:bg-white/[0.05]">Cancel</button>
                <button type="submit" disabled={saving || loading || selectedIds.length < 2} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50">
                  {saving && <Loader2 size={15} className="animate-spin" />} Create group
                </button>
              </div>
            </form>
          ) : conversation ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-400">Group name</label>
                <div className="flex gap-2">
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} disabled={!isCreator} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none disabled:opacity-60 focus:border-primary-400/50" />
                  {isCreator && <button type="button" onClick={() => void handleRename()} disabled={saving || !title.trim() || title.trim() === (conversation.title ?? '')} className="inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-40"><Pencil size={14} /> Save</button>}
                </div>
                {!isCreator && <p className="mt-1 text-[11px] text-ink-600">Only the group creator can change its name.</p>}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Members · {members.length}/25</h3>
                </div>
                <div className="space-y-1">
                  {members.map((member) => {
                    const profile = profiles[member.user_id];
                    const isSelf = member.user_id === currentUserId;
                    const isGroupCreator = member.user_id === conversation.created_by;
                    return (
                      <div key={member.user_id} className="flex items-center gap-3 rounded-xl bg-ink-900/70 px-3 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-xs font-bold text-primary-200">
                          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName(profile).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-200">{isSelf ? 'You' : displayName(profile)}</p>
                          <p className="text-[10px] text-ink-500">{isGroupCreator ? 'Group creator' : profile?.username ? '@' + profile.username : 'Member'}</p>
                        </div>
                        {isCreator && !isSelf && !isGroupCreator && <button type="button" onClick={() => void handleRemove(member.user_id)} disabled={saving} title="Remove member" className="rounded-lg p-2 text-ink-500 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"><UserMinus size={16} /></button>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isCreator && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Add friends</h3>
                  {loading ? <p className="py-4 text-sm text-ink-500">Loading friends…</p> : availableFriends.length === 0 ? <p className="rounded-xl bg-ink-900 px-3 py-4 text-xs text-ink-500">All your friends are already in this group.</p> : (
                    <div className="space-y-1">
                      {availableFriends.map(({ profile }) => (
                        <div key={profile.id} className="flex items-center gap-3 rounded-xl bg-ink-900/70 px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-200">{displayName(profile)}</span>
                          <button type="button" onClick={() => void handleAdd(profile.id)} disabled={saving || members.length >= 25} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-1.5 text-xs font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-40"><Plus size={13} /> Add</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-red-400/15 pt-4">
                <button type="button" onClick={() => void handleLeave()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-40"><LogOut size={15} /> Leave group</button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
