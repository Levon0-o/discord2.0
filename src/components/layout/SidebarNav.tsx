import { NAV_SECTIONS, type SectionId } from '@/config/navigation';
import { BrandMark } from '@/components/layout/BrandMark';
import { cn } from '@/lib/cn';

interface SidebarNavProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
}

export function SidebarNav({ activeSection, onNavigate }: SidebarNavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/60 px-3 py-6 backdrop-blur-xl md:flex lg:w-64 lg:px-4">
      <div className="px-2 md:flex md:justify-center lg:justify-start">
        <BrandMark />
      </div>

      <nav aria-label="Main" className="mt-10 flex flex-col gap-1">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onNavigate(section.id)}
              aria-current={isActive ? 'page' : undefined}
              title={section.label}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 md:justify-center lg:justify-start',
                isActive
                  ? 'bg-primary-500/15 text-primary-200 ring-1 ring-primary-400/25'
                  : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-50'
              )}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.25 : 2}
                className={cn('shrink-0 transition-colors', isActive ? 'text-primary-300' : 'text-ink-400 group-hover:text-ink-100')}
              />
              <span className="md:hidden lg:inline">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
