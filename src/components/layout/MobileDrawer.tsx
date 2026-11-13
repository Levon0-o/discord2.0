import { useEffect } from 'react';
import { X } from 'lucide-react';
import { NAV_SECTIONS, type SectionId } from '@/config/navigation';
import { BrandMark } from '@/components/layout/BrandMark';
import { cn } from '@/lib/cn';

interface MobileDrawerProps {
  open: boolean;
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  onClose: () => void;
  unreadNotificationCount: number;
}

export function MobileDrawer({ open, activeSection, onNavigate, onClose, unreadNotificationCount }: MobileDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50 md:hidden', !open && 'invisible')}>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0'
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cn(
          'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/[0.06] bg-ink-900 px-4 py-5 shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/[0.06] hover:text-ink-50"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="All sections" className="mt-8 flex flex-col gap-1">
          {NAV_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => onNavigate(section.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-500/15 text-primary-200 ring-1 ring-primary-400/25'
                    : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-50'
                )}
              >
                <span className="relative">
                  <Icon size={20} className={isActive ? 'text-primary-300' : 'text-ink-400'} />
                  {section.id === 'notifications' && unreadNotificationCount > 0 && (
                    <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full bg-rose-500" />
                  )}
                </span>
                {section.label}
                {section.id === 'notifications' && unreadNotificationCount > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
