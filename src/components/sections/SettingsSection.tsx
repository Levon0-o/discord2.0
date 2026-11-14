import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Mail, ShieldCheck, UserRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function SettingsSection() {
  const { session, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const email = session?.user.email ?? 'Unavailable';
  const createdAt = session?.user.created_at
    ? new Date(session.user.created_at).toLocaleDateString()
    : 'Unavailable';

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (password.length < 8) {
      setError('Your password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSavingPassword(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setNotice('Your password has been updated successfully.');
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">Your account</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-50">Settings</h1>
        <p className="mt-2 text-sm text-ink-400">Manage your account details and security.</p>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/60">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300"><UserRound size={19} /></div>
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Account information</h2>
            <p className="mt-0.5 text-xs text-ink-500">Details associated with your signed-in account.</p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-ink-950/50 p-4">
            <div className="flex items-center gap-2 text-xs text-ink-500"><Mail size={14} /> Email address</div>
            <p className="mt-2 break-all text-sm font-medium text-ink-100">{email}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-ink-950/50 p-4">
            <div className="flex items-center gap-2 text-xs text-ink-500"><ShieldCheck size={14} /> Account created</div>
            <p className="mt-2 text-sm font-medium text-ink-100">{createdAt}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/60">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-500/10 text-secondary-300"><KeyRound size={19} /></div>
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Password & security</h2>
            <p className="mt-0.5 text-xs text-ink-500">Choose a strong password you do not use elsewhere.</p>
          </div>
        </div>
        <form onSubmit={(event) => void handlePasswordUpdate(event)} className="space-y-4 p-5">
          <label className="block space-y-2">
            <span className="text-xs font-semibold text-ink-300">New password</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/50" />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-semibold text-ink-300">Confirm new password</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your new password again" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/50" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <p className="text-xs text-ink-500">You may be asked to verify your identity by Supabase.</p>
            <button type="submit" disabled={savingPassword || !password || !confirmPassword} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40">
              {savingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Update password
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-400/15 bg-red-400/[0.035] p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Sign out</h2>
          <p className="mt-1 text-xs text-ink-500">Sign out of AFTERDARK on this device.</p>
        </div>
        <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:opacity-50">
          {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
          Sign out
        </button>
      </section>
    </section>
  );
}
