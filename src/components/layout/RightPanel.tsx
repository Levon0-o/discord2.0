import { Activity, Sparkles } from 'lucide-react';

const PANELS = [
  {
    key: 'activity',
    title: 'Activity',
    icon: Activity,
    message: 'Activity from people you follow will appear here.',
  },
  {
    key: 'recommendations',
    title: 'Recommendations',
    icon: Sparkles,
    message: 'Suggested people and servers will appear here.',
  },
];

export function RightPanel() {
  return (
    <aside className="sticky top-6 hidden w-72 shrink-0 space-y-4 self-start xl:block">
      {PANELS.map((panel) => {
        const Icon = panel.icon;
        return (
          <section key={panel.key} className="panel p-5">
            <header className="mb-3 flex items-center gap-2">
              <Icon size={16} className="text-secondary-300" />
              <h2 className="text-sm font-semibold text-ink-100">{panel.title}</h2>
            </header>
            <p className="text-sm leading-relaxed text-ink-400">{panel.message}</p>
          </section>
        );
      })}
    </aside>
  );
}
