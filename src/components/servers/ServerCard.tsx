import { Hash, Lock, Users } from 'lucide-react';
import { ServerIcon } from '@/components/servers/ServerIcon';
import { cn } from '@/lib/cn';
import type { ServerWithMeta } from '@/types/servers';

interface ServerCardProps {
  server: ServerWithMeta;
  onOpen: (server: ServerWithMeta) => void;
  onJoin?: (server: ServerWithMeta) => void;
  joining?: boolean;
  variant?: 'owned' | 'discover';
}

export function ServerCard({
  server,
  onOpen,
  onJoin,
  joining = false,
  variant = 'owned',
}: ServerCardProps) {
  const isMember = Boolean(server.my_role);

  return (
    <article className="panel group flex flex-col overflow-hidden transition-colors hover:border-white/[0.1]">
      <button
        type="button"
        onClick={() => onOpen(server)}
        className="flex flex-1 flex-col p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <ServerIcon name={server.name} iconUrl={server.icon_url} themeColor={server.theme_color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-ink-50 group-hover:text-primary-100">
                {server.name}
              </h3>
              {server.visibility === 'private' ? (
                <Lock size={12} className="shrink-0 text-ink-500" aria-label="Private" />
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-400">
              {server.description || 'No description yet.'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {server.member_count} {server.member_count === 1 ? 'member' : 'members'}
          </span>
          {server.my_role ? (
            <span className="inline-flex items-center gap-1 capitalize text-primary-300/90">
              <Hash size={12} />
              {server.my_role}
            </span>
          ) : null}
        </div>
      </button>

      {variant === 'discover' && !isMember && onJoin ? (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <button
            type="button"
            disabled={joining}
            onClick={() => onJoin(server)}
            className={cn(
              'w-full rounded-xl bg-primary-500/15 px-3 py-2 text-sm font-semibold text-primary-200 ring-1 ring-primary-400/25 transition',
              'hover:bg-primary-500/25 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {joining ? 'Joining…' : 'Join server'}
          </button>
        </div>
      ) : null}

      {variant === 'discover' && isMember ? (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={() => onOpen(server)}
            className="w-full rounded-xl bg-ink-800 px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700"
          >
            Open
          </button>
        </div>
      ) : null}
    </article>
  );
}
