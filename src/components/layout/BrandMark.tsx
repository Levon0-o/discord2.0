import { Moon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-glow">
        <Moon size={18} className="text-white" strokeWidth={2.25} />
      </div>
      <span
        className={cn(
          'font-semibold tracking-[0.18em] text-ink-50',
          compact ? 'text-sm' : 'text-base lg:block md:hidden'
        )}
      >
        AFTERDARK
      </span>
    </div>
  );
}
