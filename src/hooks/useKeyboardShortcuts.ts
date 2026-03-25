import { useEffect } from 'react';

interface KeyboardShortcutHandlers {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onJumpToPage?: (page: number) => void;
  onCloseTab?: (tabId: string) => void;
  onEscape?: () => void;
  onHighlight?: () => void;
  onNewNote?: () => void;
  onToggleFocusMode?: () => void;
  activeTabId?: string;
  currentPage?: number;
  totalPages?: number;
}

/**
 * Global keyboard shortcuts for the PDF reader.
 * Ignores shortcuts when focus is inside an input, textarea, or contenteditable.
 */
export function useKeyboardShortcuts({
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onJumpToPage,
  onCloseTab,
  onEscape,
  onHighlight,
  onNewNote,
  onToggleFocusMode,
  activeTabId,
  currentPage = 1,
  totalPages = 0,
}: KeyboardShortcutHandlers) {
  useEffect(() => {
    const isTyping = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };

    // Cache platform check once — platform never changes at runtime.
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Always handle Escape (close panels) unless inside contenteditable.
      if (e.key === 'Escape') {
        if (target?.isContentEditable || target?.closest?.('[contenteditable="true"]')) return;
        onEscape?.();
        return;
      }

      if (isTyping(e.target)) return;

      const mod = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;

      // Cmd/Ctrl + Shift + F — toggle Focus Mode.
      if (mod && shift && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onToggleFocusMode?.();
        return;
      }

      // Cmd/Ctrl + W — close current tab.
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId && activeTabId !== 'library') {
          onCloseTab?.(activeTabId);
        }
        return;
      }

      // Cmd/Ctrl + G — jump to page dialog.
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const page = window.prompt(
          totalPages > 0 ? `Go to page (1–${totalPages})` : 'Go to page'
        );
        if (page === null) return;
        const n = parseInt(page, 10);
        if (isNaN(n) || n < 1) return;
        onJumpToPage?.(n);
        return;
      }

      // + or = — zoom in.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomIn?.();
        return;
      }

      // - — zoom out.
      if (e.key === '-') {
        e.preventDefault();
        onZoomOut?.();
        return;
      }

      // 0 — reset zoom to 100%.
      if (e.key === '0') {
        e.preventDefault();
        onResetZoom?.();
        return;
      }

      // PageUp — previous page.
      if (e.key === 'PageUp') {
        e.preventDefault();
        if (currentPage > 1) {
          onJumpToPage?.(currentPage - 1);
        }
        return;
      }

      // PageDown — next page.
      if (e.key === 'PageDown') {
        e.preventDefault();
        if (currentPage < totalPages) {
          onJumpToPage?.(currentPage + 1);
        }
        return;
      }

      // H — highlight selection.
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onHighlight?.();
        return;
      }

      // N — new note at current position.
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewNote?.();
        return;
      }
    };

    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onZoomIn, onZoomOut, onResetZoom, onJumpToPage, onCloseTab, onEscape, onHighlight, onNewNote, onToggleFocusMode, activeTabId, currentPage, totalPages]);
}
