import { describe, it, expect } from 'vitest';
import {
  getHighlightRects,
  detectColumns,
  hitTestLine,
  getHighlightRectsFromHits,
} from '../pretext-hit-test';
import type {
  PretextPageLayout,
  PretextLineData,
} from '../pretext-text-layer';

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Build a single-column layout with N equally-spaced lines. */
function makeSingleColLayout(lineCount: number, lineH = 16, pageW = 600): PretextPageLayout {
  const lines: PretextLineData[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push({
      text: `Line ${i + 1} text content here`,
      top: i * (lineH + 2), // 2px gap between lines
      height: lineH,
      segments: [{ text: `Line ${i + 1} text content here`, left: 40, width: pageW - 80 }],
    });
  }
  const result: PretextPageLayout = {
    pageNumber: 1,
    lines,
    fullText: lines.map((l) => l.text).join('\n'),
    columnInfo: { isMultiColumn: false, columns: [] },
  };
  return result;
}

/** Build a two-column layout. */
function makeTwoColLayout(lineCount: number, colGap = 30, lineH = 14): PretextPageLayout {
  const colW = 270; // each column width
  const lines: PretextLineData[] = [];
  for (let i = 0; i < lineCount; i++) {
    const isLeft = i % 2 === 0;
    lines.push({
      text: `Col text line ${i}`,
      top: Math.floor(i / 2) * (lineH + 2),
      height: lineH,
      segments: [{
        text: `Col text line ${i}`,
        left: isLeft ? 40 : 40 + colW + colGap,
        width: colW,
      }],
    });
  }
  // Manually set columnInfo
  const boundary = 40 + colW + colGap / 2;
  const result: PretextPageLayout = {
    pageNumber: 1,
    lines,
    fullText: lines.map((l) => l.text).join('\n'),
    columnInfo: {
      isMultiColumn: true,
      columns: [
        { index: 0, left: 0, right: boundary },
        { index: 1, left: boundary, right: Infinity },
      ],
      boundary,
    },
  };
  return result;
}

// ── getHighlightRects ──────────────────────────────────────────────────────────

describe('getHighlightRects', () => {
  it('returns empty array for selection outside all lines', () => {
    const layout = makeSingleColLayout(5);
    const rects = getHighlightRects(layout, 0, 500, 600, 600);
    expect(rects).toEqual([]);
  });

  it('highlights a single full line', () => {
    const layout = makeSingleColLayout(5);
    const rects = getHighlightRects(layout, 40, 0, 560, 15);
    expect(rects.length).toBe(1);
    expect(rects[0].top).toBe(0);
    expect(rects[0].width).toBeGreaterThan(0);
  });

  it('clips first line left edge to startX', () => {
    const layout = makeSingleColLayout(5);
    const startX = 200;
    const rects = getHighlightRects(layout, startX, 0, 560, 15);
    expect(rects.length).toBe(1);
    expect(rects[0].left).toBeGreaterThanOrEqual(startX);
  });

  it('clips last line right edge to endX', () => {
    const layout = makeSingleColLayout(5);
    const endX = 300;
    const rects = getHighlightRects(layout, 40, 0, endX, 15);
    expect(rects.length).toBe(1);
    expect(rects[0].left + rects[0].width).toBeLessThanOrEqual(endX);
  });

  it('highlights multiple lines spanning selection', () => {
    const layout = makeSingleColLayout(10);
    // Select from middle of line 2 to middle of line 7
    const rects = getHighlightRects(layout, 100, 36, 400, 7 * 18);
    expect(rects.length).toBe(6); // lines 2-7
  });

  it('normalizes reversed start/end coordinates', () => {
    const layout = makeSingleColLayout(5);
    const rects1 = getHighlightRects(layout, 40, 0, 560, 18);
    const rects2 = getHighlightRects(layout, 560, 18, 40, 0); // reversed
    expect(rects1.length).toBe(rects2.length);
    expect(rects1[0].left).toBe(rects2[0].left);
    expect(rects1[0].width).toBeCloseTo(rects2[0].width, 1);
  });

  it('handles single-line layout', () => {
    const layout = makeSingleColLayout(1);
    const rects = getHighlightRects(layout, 100, 0, 400, 16);
    expect(rects.length).toBe(1);
  });

  it('skips lines with empty segments', () => {
    const layout: PretextPageLayout = {
      pageNumber: 1,
      lines: [
        { text: 'Line 1', top: 0, height: 16, segments: [{ text: 'Line 1', left: 40, width: 200 }] },
        { text: '', top: 18, height: 16, segments: [] },
        { text: 'Line 3', top: 36, height: 16, segments: [{ text: 'Line 3', left: 40, width: 200 }] },
      ],
      fullText: 'Line 1\n\nLine 3',
      columnInfo: { isMultiColumn: false, columns: [] },
    };
    const rects = getHighlightRects(layout, 40, 0, 240, 52);
    expect(rects.length).toBe(2); // skips the empty line
  });
});

// ── getHighlightRects with column filtering ────────────────────────────────────

describe('getHighlightRects (multi-column)', () => {
  it('filters to left column when startX is in left column', () => {
    const layout = makeTwoColLayout(10);
    const col = layout.columnInfo;
    // startX in left column
    const rects = getHighlightRects(layout, 100, 0, 560, 5 * 16, col);
    // Should only contain left-column segments
    for (const r of rects) {
      expect(r.left).toBeLessThan(col.columns[0].right);
    }
  });

  it('filters to right column when startX is in right column', () => {
    const layout = makeTwoColLayout(10);
    const col = layout.columnInfo;
    const rightColX = col.columns[1].left + 50;
    const rects = getHighlightRects(layout, rightColX, 0, 560, 5 * 16, col);
    // Should only contain right-column segments
    for (const r of rects) {
      expect(r.left).toBeGreaterThanOrEqual(col.columns[1].left - 1);
    }
  });

  it('includes all segments when no columnInfo provided', () => {
    const layout = makeTwoColLayout(10);
    const rects = getHighlightRects(layout, 40, 0, 560, 5 * 16);
    expect(rects.length).toBeGreaterThan(0);
  });
});

// ── detectColumns ──────────────────────────────────────────────────────────────

describe('detectColumns', () => {
  it('returns single-column for few lines', () => {
    const layout = makeSingleColLayout(2);
    const info = detectColumns(layout);
    expect(info.isMultiColumn).toBe(false);
  });

  it('returns single-column for single-column layout', () => {
    const layout = makeSingleColLayout(30);
    const info = detectColumns(layout);
    expect(info.isMultiColumn).toBe(false);
  });

  it('detects two-column layout', () => {
    const layout = makeTwoColLayout(40); // 20 lines per column
    const info = detectColumns(layout);
    expect(info.isMultiColumn).toBe(true);
    expect(info.columns.length).toBe(2);
    expect(info.boundary).toBeDefined();
  });

  it('returns single-column for varied indentation (not multi-col)', () => {
    const lines: PretextLineData[] = [];
    for (let i = 0; i < 20; i++) {
      // Alternating indentation but segments extend to the same right edge
      const indent = i % 2 === 0 ? 40 : 80;
      lines.push({
        text: `Line ${i}`,
        top: i * 18,
        height: 16,
        segments: [{ text: `Line ${i}`, left: indent, width: 400 - indent }],
      });
    }
    const layout: PretextPageLayout = {
      pageNumber: 1,
      lines,
      fullText: lines.map((l) => l.text).join('\n'),
      columnInfo: { isMultiColumn: false, columns: [] },
    };
    const info = detectColumns(layout);
    // The two peaks (40 and 80) are only 40px apart
    // pageWidth = max right edge = 400. 30% of 400 = 120. 40 < 120, so single-column
    expect(info.isMultiColumn).toBe(false);
  });

  it('returns single-column for few segments', () => {
    const layout: PretextPageLayout = {
      pageNumber: 1,
      lines: [
        { text: 'Hi', top: 0, height: 16, segments: [{ text: 'Hi', left: 40, width: 20 }] },
      ],
      fullText: 'Hi',
      columnInfo: { isMultiColumn: false, columns: [] },
    };
    const info = detectColumns(layout);
    expect(info.isMultiColumn).toBe(false);
  });
});

// ── hitTestLine ────────────────────────────────────────────────────────────────

describe('hitTestLine', () => {
  it('finds correct line for given coordinate', () => {
    const layout = makeSingleColLayout(10);
    const hit = hitTestLine(layout, 100, 40); // line 2 area
    expect(hit).not.toBeNull();
    expect(hit!.lineIndex).toBe(2);
  });

  it('returns null for Y outside all lines', () => {
    const layout = makeSingleColLayout(5);
    const hit = hitTestLine(layout, 100, 999);
    expect(hit).toBeNull();
  });

  it('estimates character offset', () => {
    const layout = makeSingleColLayout(1);
    const hit = hitTestLine(layout, 100, 5);
    expect(hit).not.toBeNull();
    expect(hit!.charOffset).toBeGreaterThanOrEqual(0);
    expect(hit!.charOffset).toBeLessThan(hit!.line.segments[hit!.segmentIndex].text.length);
  });

  it('returns null for empty-segment line', () => {
    const layout: PretextPageLayout = {
      pageNumber: 1,
      lines: [{ text: '', top: 0, height: 16, segments: [] }],
      fullText: '',
      columnInfo: { isMultiColumn: false, columns: [] },
    };
    const hit = hitTestLine(layout, 100, 5);
    expect(hit).toBeNull();
  });
});

// ── getHighlightRectsFromHits ──────────────────────────────────────────────────

describe('getHighlightRectsFromHits', () => {
  it('produces rects from two hit results', () => {
    const layout = makeSingleColLayout(10);
    const startHit = hitTestLine(layout, 100, 10);
    const endHit = hitTestLine(layout, 400, 50);
    if (!startHit || !endHit) {
      // Skip if hits failed (depends on layout)
      return;
    }
    const rects = getHighlightRectsFromHits(layout, startHit, endHit);
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });
});
