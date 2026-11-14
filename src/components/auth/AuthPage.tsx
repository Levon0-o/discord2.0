import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface AuthPageProps {
  configurationMissing?: boolean;
}

function getErrorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message && caught.message !== '{}') {
    return caught.message;
  }

  if (caught && typeof caught === 'object') {
    const details = caught as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error_description', 'error', 'details', 'hint']) {
      const value = details[key];
      if (typeof value === 'string' && value.trim() && value !== '[object Object]') {
        return value;
      }
    }

    const serialized = JSON.stringify(caught);
    if (serialized && serialized !== '{}' && serialized !== '[]') {
      return serialized;
    }
  }

  return fallback;
}

export function AuthPage({ configurationMissing = false }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function switchMode(nextMode: 'login' | 'register' | 'recovery') {
    setMode(nextMode);
    setError('');
    setNotice('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (configurationMissing) {
      setError('Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file first.');
      return;
    }

    const cleanEmail = email.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (mode === 'recovery') {
      if (!cleanEmail) {
        setError('Enter the email address linked to your account.');
        return;
      }

      setBusy(true);
      try {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (recoveryError) throw recoveryError;
        setNotice('If an account exists for that email, a password reset link has been sent. Open the link, then go to Settings to choose a new password.');
      } catch (caught) {
        console.error('AFTERDARK password recovery failed:', caught);
        setError(getErrorMessage(caught, 'Could not send the password reset email.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'register') {
      if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
        setError('Username must be 3–30 characters and can contain lowercase letters, numbers, or underscores.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
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
          setNotice('Account created. Setting up your profile…');
        } else {
          setNotice('Account created. Check your inbox and confirm your email address to sign in.');
          setMode('login');
          setPassword('');
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'An unknown error occurred.';
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
            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join AFTERDARK' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            {mode === 'login' ? 'Sign in and get back to your community.' : mode === 'register' ? 'Create an account and start building your space.' : 'Enter your email address and we will send you a reset link.'}
          </p>
        </div>

        <section className="rounded-3xl border border-white/[0.08] bg-ink-900/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          {mode !== 'recovery' && <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/[0.06] bg-ink-950/70 p-1">
            <button type="button" onClick={() => switchMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === 'login' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-ink-400 hover:text-ink-100'}`}>
              Sign in
            </button>
            <button type="button" onClick={() => switchMode('register')} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === 'register' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-ink-400 hover:text-ink-100'}`}>
              Sign up
            </button>
          </div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-ink-200">Username</span>
                  <span className="relative block">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                    <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={30} placeholder="np. levon_01" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-ink-200">Display name <span className="text-ink-500">(optional)</span></span>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} placeholder="How should we display your name?" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-4 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                </label>
              </>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-200">Email address</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
              </span>
            </label>

            {mode !== 'recovery' && <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-200">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" size={17} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 py-3 pl-11 pr-12 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 transition hover:text-ink-200">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>}

            {mode === 'login' && <button type="button" onClick={() => switchMode('recovery')} className="-mt-1 text-sm font-medium text-primary-300 transition hover:text-primary-200">Forgot password?</button>}
            {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300">{notice}</p>}

            <button type="submit" disabled={busy || configurationMissing} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
              {!busy && <ArrowRight size={17} className="transition group-hover:translate-x-1" />}
            </button>
          </form>

          {mode === 'recovery' && <button type="button" onClick={() => switchMode('login')} className="mt-4 w-full text-center text-sm text-ink-400 transition hover:text-ink-100">Back to sign in</button>}

          {configurationMissing ? (
            <p className="mt-5 text-center text-xs leading-5 text-amber-300">Supabase is not configured. Add the required environment variables as described in the README.</p>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-500">
              <ShieldCheck size={14} />
              <span>Your session is secured by Supabase Auth.</span>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-ink-600">AFTERDARK · your space after dark</p>
      </div>
    </main>
  );
}
