import { useEffect, useId, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { CreateChannelInput } from '@/types/servers';

/** Matches SQL: name ~ '^[a-z0-9][a-z0-9-]{0,49}$' */
const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;

interface CreateChannelModalProps {
  open: boolean;
  busy: boolean;
  error: string;
  serverId: string;
  defaultPosition?: number;
  onClose: () => void;
  onSubmit: (input: CreateChannelInput) => Promise<void>;
}

export function CreateChannelModal({
  open,
  busy,
  error,
  serverId,
  defaultPosition = 0,
  onClose,
  onSubmit,
}: CreateChannelModalProps) {
  const titleId = useId();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('General');
  const [isRestricted, setIsRestricted] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setTopic('');
    setCategory('General');
    setIsRestricted(false);
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

    const normalizedName = name.trim().toLowerCase();
    const normalizedTopic = topic.trim();
    const normalizedCategory = category.trim() || 'General';

    if (!CHANNEL_NAME_PATTERN.test(normalizedName)) {
      setLocalError(
        'Channel name must be 1–50 characters, start with a letter or number, and use only lowercase letters, numbers, or hyphens.',
      );
      return;
    }
    if (normalizedTopic.length > 200) {
      setLocalError('Topic must be 200 characters or fewer.');
      return;
    }
    if (normalizedCategory.length < 1 || normalizedCategory.length > 40) {
      setLocalError('Category must be between 1 and 40 characters.');
      return;
    }

    await onSubmit({
      server_id: serverId,
      name: normalizedName,
      topic: normalizedTopic,
      category: normalizedCategory,
      position: defaultPosition,
      is_restricted: isRestricted,
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
              Create channel
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Add a text channel to this server.
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

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Channel name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              required
              maxLength={50}
              placeholder="e.g. announcements"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
            <span className="mt-1 block text-xs text-ink-500">
              Lowercase letters, numbers, and hyphens only.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">
              Topic <span className="font-normal text-ink-500">(optional)</span>
            </span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              placeholder="What is this channel for?"
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Category</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={40}
              placeholder="General"
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/80 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-ink-950/50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={isRestricted}
              onChange={(e) => setIsRestricted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-900 text-primary-500 focus:ring-primary-500/30"
            />
            <span>
              <span className="block text-sm font-medium text-ink-100">Restricted channel</span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Only moderators and above can view this channel.
              </span>
            </span>
          </label>

          {(localError || error) && (
            <p
              role="alert"
              className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300"
            >
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
              {busy ? 'Creating…' : 'Create channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
