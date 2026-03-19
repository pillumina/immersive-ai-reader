/**
 * Retry utilities with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
  onRetry: () => {},
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  options: Pick<Required<RetryOptions>, 'initialDelay' | 'maxDelay' | 'backoffMultiplier'>
): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this error is retryable
      if (!opts.retryableErrors(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, opts);
      opts.onRetry(attempt, error, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is a network error (transient failure)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return true;
    }
    // Connection errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return true;
    }
    // Timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return true;
    }
    // Aborted
    if (error.message.includes('aborted') || error.message.includes('cancelled')) {
      return true;
    }
    // Empty error or unknown
    if (!error.message || error.message === 'Unknown error') {
      return true;
    }
  }
  return false;
}

/**
 * Check if an error is a server error (5xx)
 */
export function isServerError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status >= 500 && status < 600;
  }
  if (error instanceof Error) {
    const match = error.message.match(/\b5\d{2}\b/);
    if (match) return true;
  }
  return false;
}

/**
 * Check if an error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429;
  }
  if (error instanceof Error && error.message.includes('429')) {
    return true;
  }
  return false;
}

/**
 * Determine if an error should trigger a retry
 * Returns true for network errors, server errors, and rate limits
 */
export function shouldRetry(error: unknown): boolean {
  return isNetworkError(error) || isServerError(error) || isRateLimitError(error);
}

/**
 * Create a retry wrapper specifically for API calls
 */
export function withAPIRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    onRetry?: (attempt: number, error: unknown, delay: number) => void;
  } = {}
): Promise<T> {
  return withRetry(fn, {
    ...options,
    retryableErrors: shouldRetry,
    initialDelay: options.maxAttempts === 1 ? 0 : 1000,
    maxDelay: options.maxAttempts === 1 ? 0 : 8000,
  });
}

/**
 * Hook-friendly retry state
 */
export interface RetryState {
  isRetrying: boolean;
  attemptCount: number;
  lastError: unknown | null;
}

/**
 * Create a retry callback with state tracking for UI updates
 */
export function useRetryWithState(options: RetryOptions = {}) {
  const stateRef = { current: { isRetrying: false, attemptCount: 0, lastError: null as unknown } };

  const wrappedFn = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
    return async () => {
      stateRef.current = { isRetrying: false, attemptCount: 0, lastError: null };

      return withRetry(fn, {
        ...options,
        onRetry: (attempt, error, delay) => {
          stateRef.current = { isRetrying: true, attemptCount: attempt, lastError: error };
          options.onRetry?.(attempt, error, delay);
        },
      });
    };
  };

  const getState = (): RetryState => {
    return {
      isRetrying: stateRef.current.isRetrying,
      attemptCount: stateRef.current.attemptCount,
      lastError: stateRef.current.lastError,
    };
  };

  return { withRetry: wrappedFn, getState };
}
