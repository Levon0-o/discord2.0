import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dashboard } from '@/components/sections/Dashboard';
import { ServersSection } from '@/components/servers/ServersSection';
import type { NavSection, SectionId } from '@/config/navigation';

interface SectionViewProps {
  section: NavSection;
  onNavigate: (id: SectionId) => void;
}

export function SectionView({ section, onNavigate }: SectionViewProps) {
  if (section.id === 'feed') {
    return <Dashboard onNavigate={onNavigate} />;
  }

  if (section.id === 'servers') {
    return <ServersSection />;
  }

  const Icon = section.icon;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 ring-1 ring-primary-400/20">
          <Icon size={22} className="text-primary-300" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">{section.label}</h1>
          <p className="text-sm text-ink-400">{section.description}</p>
        </div>
      </header>
      <EmptyState
        icon={Hammer}
        title="Not built yet"
        description="This section is scheduled for a later development stage. The navigation and layout are ready for it."
      />
    </div>
  );
}
