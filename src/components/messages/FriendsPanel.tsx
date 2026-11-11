
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Search,
  UserPlus,
  UserCheck,
  UserX,
  X,
  RefreshCw,
  Users,
  Check,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  searchUsers,
  fetchFriends,
  fetchFriendRequests,
  fetchSentFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  cancelFriendRequest,
} from '@/lib/friendsApi';
import type {
  FriendRequest,
  FriendWithProfile,
} from '@/lib/friendsApi';
import type { ProfileLite } from '@/types/servers';

interface FriendsPanelProps {
  onClose: () => void;
}

export function FriendsPanel({ onClose }: FriendsPanelProps) {
  const [tab, setTab] = useState<'friends' | 'add' | 'requests'>('friends');
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [requestProfiles, setRequestProfiles] = useState<Record<string, ProfileLite>>({});
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [friendRows, incomingRows, outgoingRows] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests(),
        fetchSentFriendRequests(),
      ]);

      setFriends(friendRows);
      setIncoming(incomingRows);
      setOutgoing(outgoingRows);

      const profileIds = [
        ...new Set([
          ...incomingRows.map((row) => row.sender_id),
          ...outgoingRows.map((row) => row.receiver_id),
        ]),
      ];

      if (profileIds.length) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', profileIds);

        if (profileError) throw profileError;

        const map: Record<string, ProfileLite> = {};
        (data ?? []).forEach((profile) => {
          map[profile.id] = profile as ProfileLite;
        });

        setRequestProfiles(map);
      } else {
        setRequestProfiles({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (query.trim().replace(/^@/, '').length < 3) {
      setError('Enter at least 3 characters of a username.');
      return;
    }

    setSearching(true);
    setError('');
    setNotice('');
    setResults([]);

    try {
      const users = await searchUsers(query);
      setResults(users);

      if (users.length === 0) {
        setNotice('No users found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(userId: string) {
    setBusyId(userId);
    setError('');
    setNotice('');

    try {
      await sendFriendRequest(userId);
      setResults((current) => current.filter((user) => user.id !== userId));
      setNotice('Friend request sent.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request.');
    } finally {
      setBusyId('');
    }
  }

  async function handleRespond(
    requestId: string,
    status: 'accepted' | 'declined',
  ) {
    setBusyId(requestId);
    setError('');

    try {
      await respondToFriendRequest(requestId, status);
      await loadData();
      setNotice(status === 'accepted' ? 'Friend added.' : 'Request declined.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request.');
    } finally {
      setBusyId('');
    }
  }

  async function handleCancel(requestId: string) {
    setBusyId(requestId);
    setError('');

    try {
      await cancelFriendRequest(requestId);
      await loadData();
      setNotice('Friend request cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel request.');
    } finally {
      setBusyId('');
    }
  }

  function avatar(profile: ProfileLite, size = 'h-10 w-10') {
    const name = profile.display_name || profile.username;

    return (
      <div className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 font-semibold text-primary-200`}>
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </div>
    );
  }

  function profileName(profile: ProfileLite) {
    return profile.display_name || profile.username;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.08] p-5">
          <div>
            <h2 className="text-xl font-bold text-ink-50">Friends</h2>
            <p className="mt-1 text-xs text-ink-500">
              Find people and manage your friends
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close friends"
          >
            <X size={20} />
          </button>
        </header>

        <nav className="flex gap-2 border-b border-white/[0.08] px-5 py-3">
          <button
            onClick={() => setTab('friends')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'friends'
                ? 'bg-primary-500/20 text-primary-200'
                : 'text-ink-400 hover:bg-white/[0.05]'
            }`}
          >
            <Users size={15} className="mr-2 inline" />
            Friends ({friends.length})
          </button>

          <button
            onClick={() => setTab('add')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'add'
                ? 'bg-primary-500/20 text-primary-200'
                : 'text-ink-400 hover:bg-white/[0.05]'
            }`}
          >
            <UserPlus size={15} className="mr-2 inline" />
            Add Friend
          </button>

          <button
            onClick={() => setTab('requests')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'requests'
                ? 'bg-primary-500/20 text-primary-200'
                : 'text-ink-400 hover:bg-white/[0.05]'
            }`}
          >
            <Clock size={15} className="mr-2 inline" />
            Requests ({incoming.length})
          </button>
        </nav>

        {(error || notice) && (
          <div className={`mx-5 mt-4 rounded-lg px-3 py-2 text-sm ${
            error
              ? 'border border-red-400/20 bg-red-400/10 text-red-300'
              : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
          }`}>
            {error || notice}
          </div>
        )}

        <div className="min-h-[300px] flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-ink-400">
              <RefreshCw size={18} className="mr-2 animate-spin" />
              Loading...
            </div>
          ) : (
            <>
              {tab === 'friends' && (
                <div className="space-y-2">
                  {friends.map(({ profile }) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3"
                    >
                      {avatar(profile)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-100">
                          {profileName(profile)}
                        </p>
                        <p className="text-xs text-ink-500">
                          @{profile.username}
                        </p>
                      </div>
                      <span className="text-xs text-emerald-400">
                        <UserCheck size={17} />
                      </span>
                    </div>
                  ))}

                  {friends.length === 0 && (
                    <div className="py-14 text-center">
                      <Users size={34} className="mx-auto mb-3 text-ink-600" />
                      <p className="font-medium text-ink-300">No friends yet</p>
                      <p className="mt-1 text-sm text-ink-500">
                        Search for someone and send a friend request.
                      </p>
                      <button
                        onClick={() => setTab('add')}
                        className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
                      >
                        Find people
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'add' && (
                <div>
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3">
                      <Search size={17} className="shrink-0 text-ink-500" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by username..."
                        className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink-100 outline-none placeholder:text-ink-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={searching}
                      className="rounded-xl bg-primary-500 px-5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50"
                    >
                      {searching ? 'Searching...' : 'Search'}
                    </button>
                  </form>

                  <p className="mt-2 text-xs text-ink-600">
                    Enter at least 3 characters. You can also search with @username.
                  </p>

                  <div className="mt-5 space-y-2">
                    {results.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3"
                      >
                        {avatar(profile)}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink-100">
                            {profileName(profile)}
                          </p>
                          <p className="text-xs text-ink-500">
                            @{profile.username}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleAdd(profile.id)}
                          disabled={busyId === profile.id}
                          className="flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-50"
                        >
                          {busyId === profile.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <UserPlus size={14} />
                          )}
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'requests' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-ink-200">
                      Incoming requests
                    </h3>

                    <div className="space-y-2">
                      {incoming.map((request) => {
                        const profile = requestProfiles[request.sender_id];
                        if (!profile) return null;

                        return (
                          <div
                            key={request.id}
                            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3"
                          >
                            {avatar(profile)}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink-100">
                                {profileName(profile)}
                              </p>
                              <p className="text-xs text-ink-500">
                                @{profile.username}
                              </p>
                            </div>
                            <button
                              onClick={() => void handleRespond(request.id, 'accepted')}
                              disabled={busyId === request.id}
                              title="Accept"
                              className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              <Check size={17} />
                            </button>
                            <button
                              onClick={() => void handleRespond(request.id, 'declined')}
                              disabled={busyId === request.id}
                              title="Decline"
                              className="rounded-lg bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <UserX size={17} />
                            </button>
                          </div>
                        );
                      })}

                      {incoming.length === 0 && (
                        <p className="rounded-xl bg-ink-900/60 px-4 py-6 text-center text-sm text-ink-500">
                          No incoming requests.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-ink-200">
                      Sent requests
                    </h3>

                    <div className="space-y-2">
                      {outgoing.map((request) => {
                        const profile = requestProfiles[request.receiver_id];
                        if (!profile) return null;

                        return (
                          <div
                            key={request.id}
                            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3"
                          >
                            {avatar(profile)}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink-100">
                                {profileName(profile)}
                              </p>
                              <p className="text-xs text-ink-500">
                                @{profile.username}
                              </p>
                            </div>
                            <button
                              onClick={() => void handleCancel(request.id)}
                              disabled={busyId === request.id}
                              className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-ink-300 hover:bg-white/10 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        );
                      })}

                      {outgoing.length === 0 && (
                        <p className="rounded-xl bg-ink-900/60 px-4 py-6 text-center text-sm text-ink-500">
                          No sent requests.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-ink-500 hover:text-ink-200 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <span className="text-[10px] text-ink-600">AFTERDARK</span>
        </footer>
      </section>
    </div>
  );
}
