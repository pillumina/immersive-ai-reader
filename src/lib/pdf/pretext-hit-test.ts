/**
 * PretextHitTest — Coordinate-to-text mapping and highlight rectangle computation.
 *
 * Replaces `range.getClientRects()` with position data from PretextPageLayout,
 * giving precise per-line highlight rectangles that respect column boundaries.
 */

import type { PretextPageLayout, PretextLineData, PretextSegment } from './pretext-text-layer';

// ─── Hit Test ───────────────────────────────────────────────────────────────────

export interface HitTestResult {
  lineIndex: number;
  line: PretextLineData;
  segmentIndex: number;
  charOffset: number;
  /** Character offset within the full line text. */
  textOffset: number;
}

/**
 * Given a page-relative coordinate, find the line and character at that point.
 */
export function hitTestLine(
  layout: PretextPageLayout,
  x: number,
  y: number,
): HitTestResult | null {
  // Find the line containing y
  let lineIdx = -1;
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    if (y >= line.top && y < line.top + line.height) {
      lineIdx = i;
      break;
    }
  }
  if (lineIdx < 0) return null;

  const line = layout.lines[lineIdx];
  if (line.segments.length === 0) return null;

  // Find the segment containing x
  const segIdx = findSegmentAtX(line.segments, x);
  const seg = line.segments[segIdx];

  // Estimate character offset within segment
  const charWidth = seg.width / Math.max(seg.text.length, 1);
  const charOffset = Math.min(
    Math.floor(Math.max(0, x - seg.left) / charWidth),
    seg.text.length - 1,
  );

  // Compute textOffset (sum of preceding segment text lengths + current offset)
  let textOffset = 0;
  for (let i = 0; i < segIdx; i++) {
    textOffset += line.segments[i].text.length;
  }
  textOffset += charOffset;

  return { lineIndex: lineIdx, line, segmentIndex: segIdx, charOffset, textOffset };
}

// ─── Highlight Rects ────────────────────────────────────────────────────────────

export interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Compute highlight rectangles for a text selection within a page.
 *
 * Given viewport-relative start/end coordinates (from the selection),
 * returns the minimal set of highlight rectangles covering the selected lines.
 *
 * This replaces `range.getClientRects()` with Pretext-derived positions,
 * which are more precise for multi-column and complex layouts.
 */
export function getHighlightRects(
  layout: PretextPageLayout,
  /** Viewport-relative start X (from selection anchor or pointerDown). */
  startX: number,
  /** Viewport-relative start Y. */
  startY: number,
  /** Viewport-relative end X (from selection focus or pointerUp). */
  endX: number,
  /** Viewport-relative end Y. */
  endY: number,
  /** Optional column boundary X — segments with left >= boundary are filtered out. */
  columnBoundary?: number,
): HighlightRect[] {
  // Normalize direction: ensure start is before end
  if (startY > endY || (startY === endY && startX > endX)) {
    [startX, endX] = [endX, startX];
    [startY, endY] = [endY, startY];
  }

  const rects: HighlightRect[] = [];

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];

    // Skip lines outside the selection Y range
    if (line.top + line.height < startY) continue;
    if (line.top > endY) break;

    const filteredSegs = columnBoundary != null
      ? line.segments.filter((s) => s.left + s.width <= columnBoundary || s.left < columnBoundary * 0.5)
      : line.segments;

    if (filteredSegs.length === 0) continue;

    const firstSeg = filteredSegs[0];
    const lastSeg = filteredSegs[filteredSegs.length - 1];

    let left: number;
    let right: number;

    const isFirstLine = line.top + line.height > startY && (i === 0 || layout.lines[i - 1].top + layout.lines[i - 1].height <= startY);
    const isLastLine = line.top <= endY && line.top + line.height > endY;

    if (isFirstLine) {
      // First line: clip left to startX
      const seg = findSegmentAtX(filteredSegs, startX);
      left = Math.max(filteredSegs[seg].left, startX);
    } else {
      left = firstSeg.left;
    }

    if (isLastLine) {
      // Last line: clip right to endX
      const seg = findSegmentAtX(filteredSegs, endX);
      right = Math.min(filteredSegs[seg].left + filteredSegs[seg].width, endX);
    } else {
      right = lastSeg.left + lastSeg.width;
    }

    if (right > left) {
      rects.push({ left, top: line.top, width: right - left, height: line.height });
    }
  }

  return rects;
}

/**
 * Get all highlight rects for a full text selection spanning start → end hits.
 * Convenience wrapper around getHighlightRects that uses HitTestResult coordinates.
 */
export function getHighlightRectsFromHits(
  layout: PretextPageLayout,
  startHit: HitTestResult,
  endHit: HitTestResult,
): HighlightRect[] {
  const startSeg = startHit.line.segments[startHit.segmentIndex];
  const endSeg = endHit.line.segments[endHit.segmentIndex];

  return getHighlightRects(
    layout,
    startSeg.left + startHit.charOffset * (startSeg.width / startSeg.text.length),
    startHit.line.top,
    endSeg.left + endHit.charOffset * (endSeg.width / endSeg.text.length),
    endHit.line.top + endHit.line.height,
  );
}

// ─── Column Detection ───────────────────────────────────────────────────────────

export interface ColumnInfo {
  isMultiColumn: boolean;
  columns: Array<{ index: number; left: number; right: number }>;
  /** X coordinate of the column boundary. */
  boundary?: number;
}

/**
 * Detect multi-column layout by analyzing the distribution of segment X positions.
 *
 * If there's a clear bimodal distribution (two clusters of starting X positions),
 * the page is likely a two-column layout.
 */
export function detectColumns(layout: PretextPageLayout): ColumnInfo {
  if (layout.lines.length < 4) {
    return { isMultiColumn: false, columns: [] };
  }

  // Collect all segment start positions
  const positions: number[] = [];
  for (const line of layout.lines) {
    for (const seg of line.segments) {
      if (seg.text.trim()) {
        positions.push(seg.left);
      }
    }
  }

  if (positions.length < 10) {
    return { isMultiColumn: false, columns: [] };
  }

  // Bin positions into buckets (5px tolerance)
  const BUCKET_SIZE = 10;
  const bucketMap = new Map<number, number>();
  for (const x of positions) {
    const key = Math.floor(x / BUCKET_SIZE);
    bucketMap.set(key, (bucketMap.get(key) || 0) + 1);
  }

  // Find the top 2 peaks
  const sorted = [...bucketMap.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length < 2) {
    return { isMultiColumn: false, columns: [] };
  }

  const peak1 = sorted[0][0] * BUCKET_SIZE + BUCKET_SIZE / 2;
  const peak2 = sorted[1][0] * BUCKET_SIZE + BUCKET_SIZE / 2;

  // Check peaks are sufficiently far apart (at least 30% of page width)
  const pageWidth = Math.max(...positions);
  if (Math.abs(peak2 - peak1) < pageWidth * 0.3) {
    return { isMultiColumn: false, columns: [] };
  }

  const boundary = (Math.min(peak1, peak2) + Math.max(peak1, peak2)) / 2;

  return {
    isMultiColumn: true,
    columns: [
      { index: 0, left: 0, right: boundary },
      { index: 1, left: boundary, right: Infinity },
    ],
    boundary,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Find the segment index whose X range is closest to the given X coordinate.
 */
function findSegmentAtX(segments: PretextSegment[], x: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // If x is within segment, use it directly
    if (x >= seg.left && x <= seg.left + seg.width) {
      return i;
    }
    // Otherwise track distance to nearest edge
    const dist = x < seg.left ? seg.left - x : x - (seg.left + seg.width);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}
