import { useCallback, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { SectionView } from '@/components/sections/SectionView';
import { AuthPage } from '@/components/auth/AuthPage';
import { ProfileBootstrap } from '@/components/auth/ProfileBootstrap';
import { NAV_SECTIONS } from '@/config/navigation';
import { useActiveSection } from '@/hooks/useActiveSection';
import { useAuth } from '@/contexts/AuthContext';

function App() {
  const { section, navigate } = useActiveSection();
  const { session, loading, configured, signOut } = useAuth();
  const [requestedConversationId, setRequestedConversationId] = useState<string | null>(null);

  const activeSection =
    NAV_SECTIONS.find((item) => item.id === section) ?? NAV_SECTIONS[0];

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      setRequestedConversationId(conversationId);
      navigate('messages');
    },
    [navigate]
  );

  const handleInitialConversationHandled = useCallback(() => {
    setRequestedConversationId(null);
  }, []);

  if (loading) {
    return (
      <main className="app-backdrop flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
          <p className="text-sm text-ink-400">Connecting to AFTERDARK…</p>
        </div>
      </main>
    );
  }

  if (!configured || !session) {
    return <AuthPage configurationMissing={!configured} />;
  }

  return (
    <ProfileBootstrap user={session.user} onSignOut={signOut}>
      <AppShell activeSection={section} onNavigate={navigate}>
        <SectionView
          section={activeSection}
          onNavigate={navigate}
          onOpenConversation={handleOpenConversation}
          initialConversationId={requestedConversationId}
          onInitialConversationHandled={handleInitialConversationHandled}
        />
      </AppShell>
    </ProfileBootstrap>
  );
}

export default App;
