import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface ProfileBootstrapProps {
  user: User;
  children: ReactNode;
  onSignOut: () => Promise<void>;
}

function validBaseUsername(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 30);
}

export function ProfileBootstrap({ user, children, onSignOut }: ProfileBootstrapProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function prepareProfile() {
      setStatus('loading');
      setError('');

      try {
        const { data: existing, error: lookupError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (!existing) {
          const metadata = user.user_metadata ?? {};
          const preferred = typeof metadata.username === 'string' ? metadata.username : '';
          const emailPrefix = user.email?.split('@')[0] ?? '';
          const base = validBaseUsername(preferred || emailPrefix) || 'member';
          let username = base.length >= 3 ? base : `${base}_user`;

          let { error: insertError } = await supabase.from('profiles').insert({
            id: user.id,
            username,
            display_name: typeof metadata.display_name === 'string' ? metadata.display_name : username,
          });

          if (insertError?.code === '23505') {
            username = `user_${user.id.replace(/-/g, '').slice(0, 8)}`;
            const retry = await supabase.from('profiles').insert({
              id: user.id,
              username,
              display_name: typeof metadata.display_name === 'string' ? metadata.display_name : username,
            });
            insertError = retry.error;
          }

          if (insertError) throw insertError;
        }

        if (!cancelled) setStatus('ready');
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Nie udało się przygotować profilu.');
          setStatus('error');
        }
      }
    }

    void prepareProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (status === 'ready') return <>{children}</>;

  return (
    <main className="app-backdrop flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-ink-900/90 p-6 text-center">
        {status === 'loading' ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
            <h1 className="text-lg font-semibold text-ink-50">Przygotowujemy profil</h1>
            <p className="mt-2 text-sm text-ink-400">To potrwa tylko chwilę.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink-50">Nie udało się przygotować profilu</h1>
            <p className="mt-2 break-words text-sm text-red-300">{error}</p>
            <p className="mt-3 text-xs text-ink-500">Sprawdź, czy migracja tabeli profiles została wykonana w Supabase.</p>
            <button onClick={() => void onSignOut()} className="mt-5 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-400">Wyloguj się</button>
          </>
        )}
      </section>
    </main>
  );
}
