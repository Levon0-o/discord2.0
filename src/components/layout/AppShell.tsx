
import { useEffect, useState, type ReactNode } from 'react';
import { BottomNav } from '@/components/layout/BottomNav';
import { BrandMark } from '@/components/layout/BrandMark';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { RightPanel } from '@/components/layout/RightPanel';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { NAV_SECTIONS, type SectionId } from '@/config/navigation';
import { supabase } from '@/lib/supabase';

interface AppShellProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  children: ReactNode;
}

export function AppShell({
  activeSection,
  onNavigate,
  children,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    let isActive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadUnreadCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isActive || !user) return;

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null);

      if (isActive && !error) setUnreadNotificationCount(count ?? 0);

      channel = supabase
        .channel(`notification-badge:${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
          async () => {
            const { count: nextCount, error: countError } = await supabase
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('recipient_id', user.id)
              .is('read_at', null);
            if (isActive && !countError) setUnreadNotificationCount(nextCount ?? 0);
          }
        )
        .subscribe();
    };

    void loadUnreadCount();

    return () => {
      isActive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const activeLabel =
    NAV_SECTIONS.find((section) => section.id === activeSection)?.label ?? '';

  const handleNavigate = (id: SectionId) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  return (
    <div className="app-backdrop h-dvh w-full overflow-hidden">
      <div className="flex h-full min-h-0 w-full">
        <SidebarNav
          activeSection={activeSection}
          onNavigate={handleNavigate}
          unreadNotificationCount={unreadNotificationCount}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-ink-950/90 px-4 backdrop-blur-xl md:hidden">
            <BrandMark compact />
            <span className="text-sm font-semibold text-ink-100">
              {activeLabel}
            </span>
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 gap-4 px-3 pb-24 pt-3 sm:px-5 md:gap-6 md:px-6 md:py-6 md:pb-6 xl:px-8">
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {children}
            </main>

            <RightPanel />
          </div>
        </div>
      </div>

      <BottomNav
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenMenu={() => setMenuOpen(true)}
        unreadNotificationCount={unreadNotificationCount}
      />

      <MobileDrawer
        open={menuOpen}
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onClose={() => setMenuOpen(false)}
        unreadNotificationCount={unreadNotificationCount}
      />
    </div>
  );
}
