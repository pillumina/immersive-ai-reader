/**
 * PretextLineCache — LRU cache for PretextPageLayout data.
 *
 * Stores per-page layout data built from pdfjs TextContent.
 * Evicts oldest entries when capacity is exceeded.
 */

import type { PretextPageLayout } from './pretext-text-layer';

const DEFAULT_MAX_PAGES = 50;

export class PretextLineCache {
  private cache = new Map<string, PretextPageLayout>();
  private readonly maxPages: number;

  constructor(maxPages = DEFAULT_MAX_PAGES) {
    this.maxPages = maxPages;
  }

  /** Build a cache key from document fingerprint and page number. */
  private key(fingerprint: string, pageNumber: number): string {
    return `${fingerprint}:${pageNumber}`;
  }

  /** Get a cached page layout, or undefined if not found. */
  get(fingerprint: string, pageNumber: number): PretextPageLayout | undefined {
    const k = this.key(fingerprint, pageNumber);
    const entry = this.cache.get(k);
    if (entry) {
      // Move to end (most recently used) by re-inserting
      this.cache.delete(k);
      this.cache.set(k, entry);
    }
    return entry;
  }

  /** Store a page layout in the cache. Evicts oldest entries if over capacity. */
  set(fingerprint: string, layout: PretextPageLayout): void {
    const k = this.key(fingerprint, layout.pageNumber);
    // Delete first to reset insertion order
    this.cache.delete(k);
    this.cache.set(k, layout);

    // Evict oldest entries if over capacity (batch eviction of 20%)
    if (this.cache.size > this.maxPages) {
      const evictCount = Math.max(1, Math.floor(this.maxPages * 0.2));
      let evicted = 0;
      for (const key of this.cache.keys()) {
        if (evicted >= evictCount) break;
        this.cache.delete(key);
        evicted++;
      }
    }
  }

  /** Check if a page layout is cached. */
  has(fingerprint: string, pageNumber: number): boolean {
    return this.cache.has(this.key(fingerprint, pageNumber));
  }

  /** Remove all entries for a specific document. */
  evictDocument(fingerprint: string): void {
    const prefix = `${fingerprint}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of cached pages. */
  get size(): number {
    return this.cache.size;
  }
}

/** Global singleton cache shared across renders. */
export const pretextLineCache = new PretextLineCache();
