import { Menu } from 'lucide-react';
import { NAV_SECTIONS, type SectionId } from '@/config/navigation';
import { cn } from '@/lib/cn';

interface BottomNavProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  onOpenMenu: () => void;
}

export function BottomNav({ activeSection, onNavigate, onOpenMenu }: BottomNavProps) {
  const primarySections = NAV_SECTIONS.filter((section) => section.mobilePrimary);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-6">
        {primarySections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSection;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onNavigate(section.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-200',
                  isActive ? 'text-primary-300' : 'text-ink-400 active:text-ink-100'
                )}
              >
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary-500/15')}>
                  <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
                </span>
                <span className="truncate">{section.label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-400 transition-colors duration-200 active:text-ink-100"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu size={20} />
            </span>
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
