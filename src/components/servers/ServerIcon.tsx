import { cn } from '@/lib/cn';

interface ServerIconProps {
  name: string;
  iconUrl?: string | null;
  themeColor?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ServerIcon({
  name,
  iconUrl,
  themeColor = '#2f7cff',
  size = 'md',
  className,
}: ServerIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={cn('shrink-0 rounded-xl object-cover ring-1 ring-white/[0.08]', SIZE_CLASS[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-semibold text-white ring-1 ring-white/[0.1]',
        SIZE_CLASS[size],
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${themeColor}, #06b6d4)` }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
