import { useEffect, useState, type KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';

interface MentionUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  'aria-label'?: string;
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  maxLength = 2000,
  className,
  onKeyDown,
  'aria-label': ariaLabel,
}: MentionTextareaProps) {
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!active || !query) {
      setUsers([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', query + '%')
        .limit(6);
      if (alive) setUsers((data ?? []) as MentionUser[]);
    }, 160);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [active, query]);

  const handleChange = (next: string, nextCursor: number) => {
    onChange(next.slice(0, maxLength));
    const before = next.slice(0, nextCursor);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]{1,30})$/);
    if (match) {
      setQuery(match[1]);
      setCursor(nextCursor);
      setActive(true);
    } else {
      setActive(false);
      setUsers([]);
    }
  };

  const choose = (username: string) => {
    const before = value.slice(0, cursor);
    const match = before.match(/@([a-zA-Z0-9_]{1,30})$/);
    if (!match) return setActive(false);
    const start = cursor - match[0].length;
    const next = value.slice(0, start) + '@' + username + ' ' + value.slice(cursor);
    onChange(next.slice(0, maxLength));
    setActive(false);
    setUsers([]);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        value={value}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && active) {
            setActive(false);
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && active && users.length > 0) {
            event.preventDefault();
            choose(users[0].username);
            return;
          }
          onKeyDown?.(event);
        }}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className={className}
      />
      {active && users.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-2 max-h-56 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-950 p-1 shadow-2xl">
          {users.map((person) => (
            <button
              key={person.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(person.username)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/[0.07]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-semibold text-primary-200">
                {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : (person.display_name || person.username).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink-100">{person.display_name || person.username}</span>
                <span className="block truncate text-[11px] text-ink-500">@{person.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
