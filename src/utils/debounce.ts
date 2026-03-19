import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Debounced value that updates after a delay
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounced callback that calls the provided function after a delay
 * Useful for auto-save scenarios
 */
export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
): [(...args: Parameters<T>) => void, () => void] {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [debouncedFn, cancel];
}

/**
 * Hook for debounced auto-save
 * Returns a save function that will debounce calls and a flush function to save immediately
 */
export function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<void> | void,
  options: {
    delay?: number;
    enabled?: boolean;
  } = {}
): {
  isPending: boolean;
  saveNow: () => void;
  cancel: () => void;
} {
  const { delay = 500, enabled = true } = options;
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValueRef = useRef<T>(value);
  const isFirstRender = useRef(true);

  // Update the ref when value changes
  lastValueRef.current = value;

  const saveNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPending(true);
    Promise.resolve(save(lastValueRef.current))
      .catch((err) => {
        console.error('[DebouncedSave] Save failed:', err);
      })
      .finally(() => {
        setIsPending(false);
      });
  }, [save]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPending(false);
  }, []);

  // Schedule save on value change
  useEffect(() => {
    if (!enabled) return;

    // Skip the first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsPending(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      timeoutRef.current = null;
      try {
        await save(value);
      } catch (err) {
        console.error('[DebouncedSave] Auto-save failed:', err);
      } finally {
        setIsPending(false);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, save, delay, enabled]);

  return { isPending, saveNow, cancel };
}
