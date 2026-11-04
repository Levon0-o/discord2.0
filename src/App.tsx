import { AppShell } from '@/components/layout/AppShell';
import { SectionView } from '@/components/sections/SectionView';
import { NAV_SECTIONS } from '@/config/navigation';
import { useActiveSection } from '@/hooks/useActiveSection';

function App() {
  const { section, navigate } = useActiveSection();
  const activeSection = NAV_SECTIONS.find((item) => item.id === section) ?? NAV_SECTIONS[0];

  return (
    <AppShell activeSection={section} onNavigate={navigate}>
      <SectionView section={activeSection} />
    </AppShell>
  );
}

export default App;
