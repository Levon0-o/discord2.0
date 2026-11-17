import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type SocialReactionEntity = 'post' | 'comment';
interface SocialReaction {
  id: string;
  entity_type: SocialReactionEntity;
  entity_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

interface SocialReactionBarProps {
  entityType: SocialReactionEntity;
  entityId: string;
}

export function SocialReactionBar({ entityType, entityId }: SocialReactionBarProps) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [reactions, setReactions] = useState<SocialReaction[]>([]);
  const [busyEmoji, setBusyEmoji] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setReactions([]);
    setError('');

    void supabase
      .from('social_reactions')
      .select('id, entity_type, entity_id, user_id, emoji, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError('Reactions unavailable');
        else setReactions((data ?? []) as SocialReaction[]);
      });

    const channel = supabase
      .channel('social-reactions:' + entityType + ':' + entityId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'social_reactions',
        filter: 'entity_id=eq.' + entityId,
      }, (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<SocialReaction>;
        if (row.entity_type !== entityType || !row.id) return;
        if (payload.eventType === 'INSERT') {
          setReactions((current) => current.some((item) => item.id === row.id) ? current : [...current, row as SocialReaction]);
        } else if (payload.eventType === 'DELETE') {
          setReactions((current) => current.filter((item) => item.id !== row.id));
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [entityType, entityId]);

  async function toggleReaction(emoji: string) {
    if (!userId || busyEmoji) return;
    setBusyEmoji(emoji);
    setError('');
    const existing = reactions.find((item) => item.user_id === userId && item.emoji === emoji);
    try {
      if (existing) {
        const { error: deleteError } = await supabase
          .from('social_reactions')
          .delete()
          .eq('id', existing.id)
          .eq('user_id', userId);
        if (deleteError) throw deleteError;
        setReactions((current) => current.filter((item) => item.id !== existing.id));
      } else {
        const { data, error: insertError } = await supabase
          .from('social_reactions')
          .insert({ entity_type: entityType, entity_id: entityId, user_id: userId, emoji })
          .select('id, entity_type, entity_id, user_id, emoji, created_at')
          .single();
        if (insertError) throw insertError;
        setReactions((current) => current.some((item) => item.id === data.id) ? current : [...current, data as SocialReaction]);
      }
    } catch {
      setError('Could not update reaction');
    } finally {
      setBusyEmoji(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Reactions">
      {REACTION_EMOJIS.map((emoji) => {
        const matching = reactions.filter((item) => item.emoji === emoji);
        const selected = matching.some((item) => item.user_id === userId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void toggleReaction(emoji)}
            disabled={!userId || busyEmoji !== null}
            aria-label={emoji + ' reaction, ' + matching.length + ' total'}
            aria-pressed={selected}
            className={'inline-flex min-h-7 items-center gap-1 rounded-lg border px-2 py-1 text-xs transition disabled:opacity-50 ' + (selected ? 'border-primary-400/50 bg-primary-500/15 text-primary-100' : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:border-white/20 hover:bg-white/[0.05]')}
          >
            <span>{emoji}</span>
            {matching.length > 0 ? <span className="tabular-nums">{matching.length}</span> : null}
          </button>
        );
      })}
      {error ? <span role="status" className="text-[10px] text-red-300">{error}</span> : null}
    </div>
  );
}
