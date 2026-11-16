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

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) console.error('Could not restore Supabase session:', error.message);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
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

    const channel = supabase.channel('afterdark-live-presence', {
      config: { presence: { key: userId } },
    });

    const publishPresence = async () => {
      if (!active) return;
      await channel.track({
        user_id: userId,
        activity_status: activity,
        last_seen_at: new Date().toISOString(),
      });
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
      if (!active) return;
      activity = document.visibilityState === 'visible' ? 'online' : 'idle';
      void publishPresence();
      if (idleTimer) clearTimeout(idleTimer);
      if (activity === 'online') {
        idleTimer = setTimeout(() => {
          activity = 'idle';
          void publishPresence();
        }, 5 * 60 * 1000);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') setActive();
      else {
        activity = 'idle';
        if (idleTimer) clearTimeout(idleTimer);
        void publishPresence();
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
          void publishPresence();
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
