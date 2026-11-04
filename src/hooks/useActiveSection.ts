import { useEffect, useState } from 'react';
import { isSectionId, type SectionId } from '@/config/navigation';

const DEFAULT_SECTION: SectionId = 'feed';

function readSectionFromHash(): SectionId {
  const value = window.location.hash.replace('#', '');
  return isSectionId(value) ? value : DEFAULT_SECTION;
}

export function useActiveSection() {
  const [section, setSection] = useState<SectionId>(readSectionFromHash);

  useEffect(() => {
    const handleHashChange = () => setSection(readSectionFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (next: SectionId) => {
    window.location.hash = next;
  };

  return { section, navigate };
}
