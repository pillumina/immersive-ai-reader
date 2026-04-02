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
  /** Page-relative start X (from selection anchor or pointerDown). */
  startX: number,
  /** Page-relative start Y. */
  startY: number,
  /** Page-relative end X (from selection focus or pointerUp). */
  endX: number,
  /** Page-relative end Y. */
  endY: number,
  /** Optional column info for multi-column pages. */
  columnInfo?: ColumnInfo,
): HighlightRect[] {
  // Normalize direction: ensure start is before end
  if (startY > endY || (startY === endY && startX > endX)) {
    [startX, endX] = [endX, startX];
    [startY, endY] = [endY, startY];
  }

  // Determine which column the selection starts in
  let targetColumn: number | undefined;
  if (columnInfo?.isMultiColumn && columnInfo.columns.length >= 2) {
    for (const col of columnInfo.columns) {
      if (startX >= col.left && startX < col.right) {
        targetColumn = col.index;
        break;
      }
    }
    // Fallback: if startX is outside all columns, pick the closest
    if (targetColumn === undefined) {
      let bestDist = Infinity;
      for (const col of columnInfo.columns) {
        const dist = startX < col.left ? col.left - startX : startX - col.right;
        if (dist < bestDist) {
          bestDist = dist;
          targetColumn = col.index;
        }
      }
    }
  }

  const rects: HighlightRect[] = [];
  let foundFirstLine = false;

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];

    // Skip lines outside the selection Y range
    if (line.top + line.height < startY) continue;
    if (line.top > endY) break;

    // Filter segments to the target column only
    const filteredSegs = targetColumn !== undefined && columnInfo?.isMultiColumn
      ? line.segments.filter((s) => {
          const col = columnInfo.columns[targetColumn!];
          // Keep segment if it overlaps with the target column
          return s.left < col.right && s.left + s.width > col.left;
        })
      : line.segments;

    if (filteredSegs.length === 0) continue;

    const firstSeg = filteredSegs[0];
    const lastSeg = filteredSegs[filteredSegs.length - 1];

    let left: number;
    let right: number;

    const isFirstLine = !foundFirstLine;
    foundFirstLine = true;
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

  // Collect all segment positions for largest-gap method
  const leftPositions: number[] = [];
  let maxRight = 0;
  for (const line of layout.lines) {
    for (const seg of line.segments) {
      if (seg.text.trim()) {
        leftPositions.push(seg.left);
        const right = seg.left + seg.width;
        if (right > maxRight) maxRight = right;
      }
    }
  }

  if (leftPositions.length < 10) {
    return { isMultiColumn: false, columns: [] };
  }

  // ── Method 1: find the largest gap between sorted left positions ──
  const sorted = [...leftPositions].sort((a, b) => a - b);
  let maxGap = 0;
  let maxGapLeft = 0;
  let maxGapRight = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
      maxGapLeft = sorted[i - 1];
      maxGapRight = sorted[i];
    }
  }

  // ── Method 2: bimodal bucket peak detection ──
  // Bin into 5px buckets and find the two most populous non-adjacent buckets
  const BUCKET = 5;
  const bucketMap = new Map<number, { count: number; maxRight: number; minLeft: number }>();
  for (const seg of layout.lines.flatMap((l) => l.segments)) {
    if (!seg.text.trim()) continue;
    const key = Math.floor(seg.left / BUCKET);
    const existing = bucketMap.get(key);
    const right = seg.left + seg.width;
    if (existing) {
      existing.count++;
      if (right > existing.maxRight) existing.maxRight = right;
      if (seg.left < existing.minLeft) existing.minLeft = seg.left;
    } else {
      bucketMap.set(key, { count: 1, maxRight: right, minLeft: seg.left });
    }
  }
  const bucketSorted = [...bucketMap.entries()].sort((a, b) => b[1].count - a[1].count);

  let bucketBoundary = 0;
  let isMultiBucket = false;
  let bucketGap = 0;
  if (bucketSorted.length >= 2) {
    const [peak1Key, peak1] = bucketSorted[0];
    const [peak2Key, peak2] = bucketSorted[1];
    bucketGap = Math.abs(peak1Key - peak2Key) * BUCKET;
    if (bucketGap >= maxRight * 0.25) {
      isMultiBucket = true;
      // Determine which bucket is on the left (lower key = left column)
      const [leftPeak, rightPeak] =
        peak1Key < peak2Key ? [peak1, peak2] : [peak2, peak1];
      // True boundary: midpoint between the right edge of the left column
      // (leftPeak.maxRight) and the left edge of the right column (rightPeak.minLeft)
      bucketBoundary = (leftPeak.maxRight + rightPeak.minLeft) / 2;
    }
  }

  // Use whichever method gives the larger gap.
  // When gaps are equal, prefer the bucket method — it computes the boundary
  // from actual segment right edges (more accurate for real PDFs where bucket
  // centers don't reflect true column boundaries).
  const useBucket = isMultiBucket && bucketGap >= maxGap;
  const boundary = useBucket ? bucketBoundary : (maxGapLeft + maxGapRight) / 2;
  const boundaryGap = useBucket ? bucketGap : maxGap;

  if (boundaryGap < maxRight * 0.25) {
    return { isMultiColumn: false, columns: [] };
  }

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
