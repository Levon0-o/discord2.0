import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type LivePresence = 'online' | 'idle';
type PresenceMap = Record<string, LivePresence>;

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  presence: PresenceMap;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (credentials: SignUpWithPasswordCredentials) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<PresenceMap>({});

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let alive = true;

    let receivedAuthEvent = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      setSession(nextSession);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      // An auth event is authoritative. Do not let a slower initial session
      // lookup overwrite a newer sign-in, refresh, or sign-out event.
      if (!alive || receivedAuthEvent) return;
      if (error) console.error('Could not restore Supabase session:', error.message);
      setSession(data.session);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!alive || receivedAuthEvent) return;
      console.error('Could not restore Supabase session:', error);
      setSession(null);
      setLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !isSupabaseConfigured) {
      setPresence({});
      return;
    }

    let active = true;
    let activity: LivePresence = document.visibilityState === 'visible' ? 'online' : 'idle';
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActivityEventAt = 0;
    let lastPublishedActivity: LivePresence | null = null;
    let lastPublishedAt = 0;

    const channel = supabase.channel('afterdark-live-presence', {
      config: { presence: { key: userId } },
    });

    const publishPresence = async (force = false) => {
      if (!active) return;
      const now = Date.now();
      // Pointer movement can fire dozens of times per second. Track presence
      // only on status changes or at most once per minute while active.
      if (!force && activity === lastPublishedActivity && now - lastPublishedAt < 60_000) return;

      lastPublishedActivity = activity;
      lastPublishedAt = now;
      try {
        const status = await channel.track({
          user_id: userId,
          activity_status: activity,
          last_seen_at: new Date(now).toISOString(),
        });
        if (status !== 'ok' && active) lastPublishedAt = 0;
      } catch {
        if (active) lastPublishedAt = 0;
      }
    };

    const refreshPresence = () => {
      if (!active) return;
      const state = channel.presenceState() as Record<string, Array<{
        user_id?: string;
        activity_status?: string;
      }>>;
      const next: PresenceMap = {};
      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
          if (entry.user_id && (entry.activity_status === 'online' || entry.activity_status === 'idle')) {
            next[entry.user_id] = entry.activity_status;
          }
        });
      });
      setPresence(next);
    };

    const setActive = () => {
      if (!active || document.visibilityState !== 'visible') return;
      const now = Date.now();
      // Throttle noisy pointermove/scroll events while still extending the
      // five-minute idle window often enough for normal interaction.
      if (now - lastActivityEventAt < 10_000) return;
      lastActivityEventAt = now;

      const becameOnline = activity !== 'online';
      activity = 'online';
      if (idleTimer) clearTimeout(idleTimer);
      if (becameOnline) void publishPresence(true);

      idleTimer = setTimeout(() => {
        if (!active || document.visibilityState !== 'visible') return;
        activity = 'idle';
        void publishPresence(true);
      }, 5 * 60 * 1000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityEventAt = 0;
        setActive();
      } else {
        lastActivityEventAt = Date.now();
        if (idleTimer) clearTimeout(idleTimer);
        if (activity !== 'idle') {
          activity = 'idle';
          void publishPresence(true);
        }
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, setActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);

    channel
      .on('presence', { event: 'sync' }, refreshPresence)
      .on('presence', { event: 'join' }, refreshPresence)
      .on('presence', { event: 'leave' }, refreshPresence)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void publishPresence(true);
          refreshPresence();
        }
      });

    setActive();

    return () => {
      active = false;
      if (idleTimer) clearTimeout(idleTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, setActive));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      configured: isSupabaseConfigured,
      presence,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(credentials) {
        const { data, error } = await supabase.auth.signUp(credentials);
        if (error) throw error;
        return Boolean(data.session);
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading, presence],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
