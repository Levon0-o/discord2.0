import { useEffect, useId, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { CreateServerInput, ServerVisibility } from '@/types/servers';

interface CreateServerModalProps {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: CreateServerInput) => Promise<void>;
}

export function CreateServerModal({ open, busy, error, onClose, onSubmit }: CreateServerModalProps) {
  const titleId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ServerVisibility>('public');
  const [iconUrl, setIconUrl] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setVisibility('public');
    setIconUrl('');
    setLocalError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError('');

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setLocalError('Server name must be between 2 and 60 characters.');
      return;
    }
    if (description.trim().length > 500) {
      setLocalError('Description must be 500 characters or fewer.');
      return;
    }

    await onSubmit({
      name: trimmed,
      description: description.trim(),
      visibility,
      icon_url: iconUrl.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-white/[0.08] bg-ink-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink-50">
              Create a server
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Build a community with channels and members.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={60}
              placeholder="e.g. Night Owl Lounge"
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">
              Description <span className="font-normal text-ink-500">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What is this server about?"
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">
              Icon URL <span className="font-normal text-ink-500">(optional)</span>
            </span>
            <input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              type="url"
              placeholder="https://…"
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
          </label>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-200">Visibility</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'public', label: 'Public', hint: 'Anyone can join' },
                  { value: 'private', label: 'Private', hint: 'Invite only' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisibility(option.value)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition',
                    visibility === option.value
                      ? 'border-primary-400/40 bg-primary-500/15 text-primary-100'
                      : 'border-white/[0.08] bg-ink-950/50 text-ink-300 hover:border-white/[0.12]',
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs opacity-80">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {(localError || error) && (
            <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300">
              {localError || error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-white/[0.04] hover:text-ink-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
