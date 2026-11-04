import { useState, type ReactNode } from 'react';
import { BottomNav } from '@/components/layout/BottomNav';
import { BrandMark } from '@/components/layout/BrandMark';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { RightPanel } from '@/components/layout/RightPanel';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { NAV_SECTIONS, type SectionId } from '@/config/navigation';

interface AppShellProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  children: ReactNode;
}

export function AppShell({ activeSection, onNavigate, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeLabel = NAV_SECTIONS.find((section) => section.id === activeSection)?.label ?? '';

  const handleNavigate = (id: SectionId) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <SidebarNav activeSection={activeSection} onNavigate={handleNavigate} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-ink-950/85 px-4 backdrop-blur-xl md:hidden">
            <BrandMark compact />
            <span className="text-sm font-medium text-ink-200">{activeLabel}</span>
          </header>

          <div className="flex flex-1 gap-6 px-4 pb-28 pt-4 md:px-6 md:pb-10 lg:pt-8">
            <main className="min-w-0 flex-1 max-w-3xl">{children}</main>
            <RightPanel />
          </div>
        </div>
      </div>

      <BottomNav activeSection={activeSection} onNavigate={handleNavigate} onOpenMenu={() => setMenuOpen(true)} />
      <MobileDrawer
        open={menuOpen}
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  );
}
