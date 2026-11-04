import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
        <Icon size={24} className="text-secondary-300" />
      </div>
      <h2 className="text-base font-semibold text-ink-100">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">{description}</p>
    </div>
  );
}
