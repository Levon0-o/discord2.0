import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthPageProps {
  configurationMissing?: boolean;
}

export function AuthPage({ configurationMissing = false }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setError('');
    setNotice('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (configurationMissing) {
      setError('Najpierw uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY w pliku .env.');
      return;
    }

    const cleanEmail = email.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (mode === 'register') {
      if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
        setError('Nazwa użytkownika musi mieć 3–30 znaków: małe litery, cyfry lub _.');
        return;
      }
      if (password.length < 8) {
        setError('Hasło musi mieć co najmniej 8 znaków.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(cleanEmail, password);
      } else {
        const hasSession = await signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: displayName.trim() || cleanUsername,
            },
          },
        });

        if (hasSession) {
          setNotice('Konto utworzone. Przygotowujemy Twój profil…');
        } else {
          setNotice('Konto utworzone. Sprawdź skrzynkę e-mail i potwierdź adres, aby się zalogować.');
          setMode('login');
          setPassword('');
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Wystąpił nieznany błąd.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-400/25 bg-primary-500/15 shadow-[0_0_50px_rgba(47,124,255,0.16)]">
            <span className="text-2xl font-black tracking-tighter text-primary-300">A</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary-300">AFTERDARK</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50">
            {mode === 'login' ? 'Witaj ponownie' : 'Dołącz do AFTERDARK'}
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            {mode === 'login' ? 'Zaloguj się i wróć do swojej społeczności.' : 'Utwórz konto i zacznij budować swoją przestrzeń.'}
          </p>
        </div>

        <section className="rounded-3xl border border-white/[0.08] bg-ink-900/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/[0.06] bg-ink-950/70 p-1">
            <button type="button" onClick={() => switchMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === 'login' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-ink-400 hover:text-ink-100'}`}>
              Logowanie
            </button>
            <button type="button" onClick={() => switchMode('register')} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === 'register' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-ink-400 hover:text-ink-100'}`}>
              Rejestracja
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-ink-200">Nazwa użytkownika</span>
                  <span className="relative block">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                    <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={30} placeholder="np. levon_01" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-ink-200">Nazwa wyświetlana <span className="text-ink-500">(opcjonalnie)</span></span>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} placeholder="Jak mamy Cię wyświetlać?" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-4 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                </label>
              </>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-200">Adres e-mail</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-200">Hasło</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} placeholder={mode === 'register' ? 'Minimum 8 znaków' : 'Twoje hasło'} className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-12 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 transition hover:text-ink-200">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300">{notice}</p>}

            <button type="submit" disabled={busy || configurationMissing} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Chwila…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
              {!busy && <ArrowRight size={17} className="transition group-hover:translate-x-1" />}
            </button>
          </form>

          {configurationMissing ? (
            <p className="mt-5 text-center text-xs leading-5 text-amber-300">Brakuje konfiguracji Supabase. Uzupełnij zmienne środowiskowe zgodnie z plikiem README.</p>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-500">
              <ShieldCheck size={14} />
              <span>Sesja jest obsługiwana przez Supabase Auth.</span>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-ink-600">AFTERDARK · your space after dark</p>
      </div>
    </main>
  );
}
