import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dashboard } from '@/components/sections/Dashboard';
import { ServersSection } from '@/components/servers/ServersSection';
import { DirectMessagesSection } from '@/components/messages/DirectMessagesSection';
import { NotificationsSection } from '@/components/sections/NotificationsSection';
import { ExploreSection } from '@/components/sections/ExploreSection';
import { SavedSection } from '@/components/sections/SavedSection';
import { ProfileSection } from '@/components/sections/ProfileSection';
import type { NavSection, SectionId } from '@/config/navigation';

interface SectionViewProps {
  section: NavSection;
  onNavigate: (id: SectionId) => void;
  onOpenConversation: (conversationId: string) => void;
  initialConversationId: string | null;
  onInitialConversationHandled: () => void;
}

export function SectionView({
  section,
  onNavigate,
  onOpenConversation,
  initialConversationId,
  onInitialConversationHandled,
}: SectionViewProps) {
  if (section.id === 'feed') {
    return (
      <Dashboard
        onNavigate={onNavigate}
        onOpenConversation={onOpenConversation}
      />
    );
  }

  if (section.id === 'explore') {
    return <ExploreSection />;
  }

  if (section.id === 'servers') {
    return <ServersSection />;
  }

  if (section.id === 'saved') {
    return <SavedSection />;
  }

  if (section.id === 'notifications') {
    return <NotificationsSection />;
  }

  if (section.id === 'profile') {
    return <ProfileSection />;
  }

  if (section.id === 'messages') {
    return (
      <DirectMessagesSection
        initialConversationId={initialConversationId}
        onInitialConversationHandled={onInitialConversationHandled}
      />
    );
  }

  const Icon = section.icon;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 ring-1 ring-primary-400/20">
          <Icon size={22} className="text-primary-300" />
        </div>

        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
            {section.label}
          </h1>

          <p className="text-sm text-ink-400">
            {section.description}
          </p>
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
