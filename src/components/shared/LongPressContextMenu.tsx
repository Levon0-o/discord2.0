import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface LongPressMenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface LongPressContextMenuProps {
  actions: LongPressMenuAction[];
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function LongPressContextMenu({ actions, children, className = '', disabled = false }: LongPressContextMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const openedByLongPressRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  const openMenu = (x: number, y: number) => {
    if (disabled || actions.length === 0) return;
    openedByLongPressRef.current = true;
    setMenu({ x: Math.max(12, Math.min(x, window.innerWidth - 220)), y: Math.max(12, Math.min(y, window.innerHeight - Math.min(actions.length * 44 + 16, 320))) });
  };

  return (
    <div
      className={className}
      onContextMenu={(event) => {
        if (disabled || actions.length === 0) return;
        event.preventDefault();
        openMenu(event.clientX, event.clientY);
      }}
      onPointerDown={(event) => {
        if (disabled || actions.length === 0 || event.pointerType !== 'touch') return;
        startRef.current = { x: event.clientX, y: event.clientY };
        openedByLongPressRef.current = false;
        clearTimer();
        timerRef.current = setTimeout(() => openMenu(event.clientX, event.clientY), 520);
      }}
      onPointerMove={(event) => {
        if (!startRef.current || event.pointerType !== 'touch') return;
        if (Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y) > 12) {
          clearTimer();
          startRef.current = null;
        }
      }}
      onPointerUp={() => { clearTimer(); startRef.current = null; }}
      onPointerCancel={() => { clearTimer(); startRef.current = null; }}
    >
      {children}
      {menu && (
        <div className="fixed inset-0 z-[100] touch-none" onPointerDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }}>
          <div
            role="menu"
            className="absolute max-h-[min(70vh,320px)] w-52 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-1.5 shadow-2xl shadow-black/50"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {actions.map((action, index) => (
              <button
                key={action.label + index}
                type="button"
                role="menuitem"
                onClick={() => { setMenu(null); action.onSelect(); }}
                className={'flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-white/[0.07] ' + (action.danger ? 'text-red-300 hover:text-red-200' : 'text-ink-200')}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
