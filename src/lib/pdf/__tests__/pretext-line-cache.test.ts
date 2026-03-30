import { describe, it, expect } from 'vitest';
import { PretextLineCache } from '../pretext-line-cache';
import type { PretextPageLayout } from '../pretext-text-layer';

function makeLayout(pageNumber: number): PretextPageLayout {
  return {
    pageNumber,
    lines: [],
    fullText: '',
    columnInfo: { isMultiColumn: false, columns: [] },
  };
}

// ── PretextLineCache ───────────────────────────────────────────────────────────

describe('PretextLineCache', () => {
  it('stores and retrieves a layout', () => {
    const cache = new PretextLineCache();
    const layout = makeLayout(1);
    cache.set('doc1', layout);
    expect(cache.get('doc1', 1)).toBe(layout);
  });

  it('returns undefined for missing entry', () => {
    const cache = new PretextLineCache();
    expect(cache.get('doc1', 1)).toBeUndefined();
  });

  it('evicts oldest entries when over capacity', () => {
    const cache = new PretextLineCache(5);
    for (let i = 1; i <= 7; i++) {
      cache.set('doc1', makeLayout(i));
    }
    // Cache should have evicted some entries
    expect(cache.size).toBeLessThanOrEqual(5);
  });

  it('preserves recently accessed entries during eviction', () => {
    const cache = new PretextLineCache(5);
    // Fill cache
    for (let i = 1; i <= 5; i++) {
      cache.set('doc1', makeLayout(i));
    }
    // Access page 1 (makes it most recently used)
    cache.get('doc1', 1);
    // Add 2 more to trigger eviction
    cache.set('doc1', makeLayout(6));
    cache.set('doc1', makeLayout(7));
    // Page 1 should still be cached (it was accessed recently)
    expect(cache.get('doc1', 1)).toBeDefined();
  });

  it('overwrites existing entry on set', () => {
    const cache = new PretextLineCache();
    cache.set('doc1', makeLayout(1));
    const updated = { ...makeLayout(1), fullText: 'updated' };
    cache.set('doc1', updated);
    expect(cache.get('doc1', 1)?.fullText).toBe('updated');
  });

  it('isolates entries by fingerprint', () => {
    const cache = new PretextLineCache();
    cache.set('doc1', makeLayout(1));
    cache.set('doc2', makeLayout(1));
    expect(cache.get('doc1', 1)).toBeDefined();
    expect(cache.get('doc2', 1)).toBeDefined();
    expect(cache.get('doc1', 1)).not.toBe(cache.get('doc2', 1));
  });

  it('evictDocument removes all entries for a document', () => {
    const cache = new PretextLineCache();
    cache.set('doc1', makeLayout(1));
    cache.set('doc1', makeLayout(2));
    cache.set('doc2', makeLayout(1));
    cache.evictDocument('doc1');
    expect(cache.get('doc1', 1)).toBeUndefined();
    expect(cache.get('doc1', 2)).toBeUndefined();
    expect(cache.get('doc2', 1)).toBeDefined();
  });

  it('clear removes all entries', () => {
    const cache = new PretextLineCache();
    cache.set('doc1', makeLayout(1));
    cache.set('doc2', makeLayout(2));
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('has returns correct boolean', () => {
    const cache = new PretextLineCache();
    cache.set('doc1', makeLayout(1));
    expect(cache.has('doc1', 1)).toBe(true);
    expect(cache.has('doc1', 2)).toBe(false);
    expect(cache.has('doc2', 1)).toBe(false);
  });
});
