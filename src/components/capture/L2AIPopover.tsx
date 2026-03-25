import { useEffect, useRef, useState, useCallback } from 'react';

/** Position relative to viewport (fixed coordinates) */
export interface L2PopoverPosition {
  x: number;
  y: number;
}

export type L2Action =
  | { type: 'explain'; text: string; page?: number }
  | { type: 'translate'; text: string; page?: number }
  | { type: 'add-to-session'; text: string; page?: number }
  | { type: 'new-note'; text: string; page?: number };

interface L2AIPopoverProps {
  position: L2PopoverPosition;
  text: string;
  page?: number;
  isFocusMode: boolean;
  onAction: (action: L2Action) => void;
  onClose: () => void;
}

interface L2Option {
  key: string;
  label: string;
  icon: string;
  shortcut: string;
}

const OPTIONS: L2Option[] = [
  { key: 'explain', label: '让 AI 解释', icon: '🤖', shortcut: '1' },
  { key: 'translate', label: '让 AI 翻译', icon: '🌐', shortcut: '2' },
  { key: 'add-to-session', label: '加入 AI 会话', icon: '💬', shortcut: '3' },
  { key: 'new-note', label: '新建笔记', icon: '📝', shortcut: '4' },
];

/** Debounce window after popover appears (ms) — prevents accidental double-clicks */
const DEBOUNCE_MS = 300;
/** Auto-close timeout (ms) */
const AUTO_CLOSE_MS = 10_000;

export function L2AIPopover({
  position,
  text,
  page,
  isFocusMode,
  onAction,
  onClose,
}: L2AIPopoverProps) {
  const [entered, setEntered] = useState(false);
  const [debouncing, setDebouncing] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Slide-in animation trigger
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Auto-close after 10s of inactivity
  useEffect(() => {
    autoCloseTimerRef.current = setTimeout(() => {
      onClose();
    }, AUTO_CLOSE_MS);
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [onClose]);

  // Reset auto-close on any user interaction
  const resetAutoClose = useCallback(() => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      onClose();
    }, AUTO_CLOSE_MS);
  }, [onClose]);

  const handleOptionClick = useCallback(
    (key: string) => {
      // Debounce: ignore clicks within 300ms of popover appearing
      if (debouncing) return;

      debounceTimerRef.current = setTimeout(() => {
        setDebouncing(false);
      }, DEBOUNCE_MS);
      setDebouncing(true);

      onAction({ type: key as L2Action['type'], text, page });
      onClose();
    },
    [debouncing, onAction, onClose, text, page]
  );

  // Keyboard shortcuts (1-4, Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      const option = OPTIONS.find((o) => o.shortcut === e.key);
      if (option) {
        e.preventDefault();
        handleOptionClick(option.key);
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onClose, handleOptionClick]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    };
    // Delay so the click that opened the popover doesn't immediately close it
    const t = setTimeout(() => {
      globalThis.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(t);
      globalThis.removeEventListener('mousedown', handler);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [onClose]);

  // Compute position — show below the bubble, flip above if not enough space
  const POPOVER_WIDTH = isFocusMode ? 200 : 220;
  const POPOVER_HEIGHT = 36 * OPTIONS.length; // ~144px
  const MARGIN = 8;

  const viewportH = globalThis.window?.innerHeight ?? 800;
  const viewportW = globalThis.window?.innerWidth ?? 1200;

  // Default: show below bubble
  let left = position.x;
  let top = position.y + MARGIN;

  // Flip above if not enough space below
  if (top + POPOVER_HEIGHT > viewportH - MARGIN) {
    top = position.y - POPOVER_HEIGHT - MARGIN;
  }

  // Clamp horizontally
  if (left + POPOVER_WIDTH > viewportW - MARGIN) {
    left = viewportW - POPOVER_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  const animDuration = isFocusMode ? 80 : 120;

  return (
    <div
      ref={popoverRef}
      role="menu"
      aria-label="AI capture options"
      className="l2-popover fixed z-[9999] flex flex-col rounded-xl border border-[#e7e5e4]/80 bg-white/98 shadow-[0_8px_32px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08)] backdrop-blur-md"
      style={{
        left,
        top,
        width: POPOVER_WIDTH,
        animation: entered
          ? `l2-slide-in ${animDuration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
          : 'opacity: 0; transform: translateY(-4px)',
      }}
      onMouseMove={resetAutoClose}
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="menuitem"
          className="l2-option flex items-center gap-3 px-3 py-2.5 text-left text-[13px] text-[#1c1917] transition-all duration-75 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 36 }}
          onClick={() => handleOptionClick(option.key)}
          title={`${option.label} (${option.shortcut})`}
        >
          <span className="text-base leading-none">{option.icon}</span>
          <span className="flex-1 font-medium">{option.label}</span>
          <span className="text-[10px] font-mono text-[#a8a29e]">{option.shortcut}</span>
        </button>
      ))}

      <style>{`
        @keyframes l2-slide-in {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
