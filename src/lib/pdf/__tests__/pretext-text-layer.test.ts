import { describe, it, expect } from 'vitest';
import { buildPageLayout } from '../pretext-text-layer';

// ── Helper: create a pdfjs-style TextItem ────────────────────────────────────

function makeTextItem(
  str: string,
  x: number,
  y: number,
  fontSize: number,
  width: number,
) {
  return {
    str,
    dir: 'ltr',
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, x, y] as [number, number, number, number, number, number],
    fontName: 'TestFont',
    hasEOL: false,
  };
}

// ── buildPageLayout ────────────────────────────────────────────────────────────

describe('buildPageLayout', () => {
  const SCALE = 1.5;
  const VIEWPORT_H = 800;

  it('returns empty layout for empty items', () => {
    const layout = buildPageLayout([], 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines).toEqual([]);
    expect(layout.fullText).toBe('');
    expect(layout.pageNumber).toBe(1);
    expect(layout.columnInfo.isMultiColumn).toBe(false);
  });

  it('returns empty layout for items with empty strings', () => {
    const items: Array<{ str: '' }> = [{ str: '' }, { str: '' }];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines).toEqual([]);
  });

  it('groups items on the same baseline into one line', () => {
    const items = [
      makeTextItem('Hello ', 40, 700, 12, 36),
      makeTextItem('World', 76, 700, 12, 30),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    // Both items share baselineY=700, should be one line
    expect(layout.lines.length).toBe(1);
    // Text should be concatenated (order by X)
    expect(layout.lines[0].text).toBe('Hello World');
  });

  it('separates items on different baselines into different lines', () => {
    const items = [
      makeTextItem('Line 1', 40, 700, 12, 42),
      makeTextItem('Line 2', 40, 686, 12, 42),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines.length).toBe(2);
  });

  it('orders lines top-to-bottom (ascending top)', () => {
    const items = [
      makeTextItem('Bottom', 40, 600, 12, 42),
      makeTextItem('Top', 40, 700, 12, 42),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    // Higher baselineY in PDF coords = lower viewport Y = appears first
    expect(layout.lines[0].top).toBeLessThan(layout.lines[1].top);
  });

  it('computes correct segment positions', () => {
    const items = [
      makeTextItem('ABC', 100, 700, 12, 60),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines.length).toBe(1);
    const seg = layout.lines[0].segments[0];
    expect(seg.left).toBe(100 * SCALE); // transform[4] * scale
    expect(seg.width).toBe(60); // already in viewport units
  });

  it('merges adjacent segments within 3px gap', () => {
    // In viewport coords: seg1 left=40*1.5=60, width=30; seg2 left=62*1.5=93, width=30
    // Gap = 93 - (60+30) = 3px → should merge
    const items = [
      makeTextItem('AB', 40, 700, 12, 30),
      makeTextItem('CD', 62, 700, 12, 30),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines[0].segments.length).toBe(1);
    expect(layout.lines[0].segments[0].text).toBe('ABCD');
  });

  it('does not merge segments with >3px gap', () => {
    const items = [
      makeTextItem('AB', 40, 700, 12, 30),
      makeTextItem('CD', 80, 700, 12, 30), // gap = 80 - (40+30) = 10px → no merge
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    expect(layout.lines[0].segments.length).toBe(2);
  });

  it('skips items with whitespace-only text', () => {
    const items = [
      makeTextItem('   ', 40, 700, 12, 20),
      makeTextItem('Hello', 40, 686, 12, 30),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    // Whitespace-only item should be filtered in segment building
    expect(layout.lines.length).toBe(1); // only 'Hello' line
  });

  it('computes correct top position from PDF coords', () => {
    const items = [
      makeTextItem('Test', 40, 700, 12, 40),
    ];
    const layout = buildPageLayout(items, 600, VIEWPORT_H, 1, SCALE);
    // top = viewportHeight - baselineY * scale - fontSize * scale
    const expectedTop = VIEWPORT_H - 700 * SCALE - 12 * SCALE;
    expect(layout.lines[0].top).toBeCloseTo(expectedTop, 1);
  });

  it('computes columnInfo and caches it', () => {
    const layout = buildPageLayout([], 600, VIEWPORT_H, 1, SCALE);
    expect(layout.columnInfo).toBeDefined();
    expect(layout.columnInfo.isMultiColumn).toBe(false);
  });
});
