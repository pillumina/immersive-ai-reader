import { useEffect, useRef } from 'react';

/** Returns tabbable elements within a container ref, excluding the container itself */
function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const selector = [
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'a[href]',
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

interface UseFocusTrapOptions {
  /** Set to false when the trap should be inactive (e.g. modal closed) */
  active: boolean;
  onEscape?: () => void;
  /** Element to focus on mount. Defaults to first focusable element */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Simple focus trap for modal/popover components.
 * Traps Tab navigation within the container ref and handles Escape to close.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  { active, onEscape, initialFocusRef }: UseFocusTrapOptions
) {
  // Store the previously focused element to restore on close
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;

    // Save current focus and restore on cleanup
    previousActiveElement.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus initial element or first focusable element
    const focusTarget = initialFocusRef?.current ?? getFocusableElements(container)[0];
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      (focusTarget ?? container)?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) { e.preventDefault(); return; }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (active === first || !container.contains(active as Node)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (active === last || !container.contains(active as Node)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [active, containerRef, onEscape, initialFocusRef]);
}
