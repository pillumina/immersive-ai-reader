/**
 * PretextTextLayer — Build page layout data from pdfjs TextContent.
 *
 * Extracts line/segment positions directly from pdfjs TextItem transforms,
 * enabling precise highlight rectangles and column detection without DOM text layers.
 */

import type { ColumnInfo } from './pretext-hit-test';
import { detectColumns } from './pretext-hit-test';

// ─── Public Types ──────────────────────────────────────────────────────────────

/** A single segment within a line (a contiguous run of text at one position). */
export interface PretextSegment {
  text: string;
  /** X position relative to page origin (px). */
  left: number;
  /** Width in px. */
  width: number;
}

/** A single line of text on a PDF page. */
export interface PretextLineData {
  /** Full line text. */
  text: string;
  /** Y position relative to page top (px). */
  top: number;
  /** Line height (px). */
  height: number;
  /** Segments within this line. */
  segments: PretextSegment[];
}

/** Layout data for a single PDF page. */
export interface PretextPageLayout {
  pageNumber: number;
  lines: PretextLineData[];
  fullText: string;
  /** Cached column detection result (computed once at build time). */
  columnInfo: ColumnInfo;
}

// ─── Internal: pdfjs TextItem type ─────────────────────────────────────────────

interface PdfTextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
  fontName: string;
  hasEOL: boolean;
}

/** A group of TextItems that share the same baseline (same line). */
interface LineGroup {
  items: PdfTextItem[];
  /** Baseline Y in PDF coordinates (origin bottom-left). */
  baselineY: number;
  /** Font size (approximate, from transform). */
  fontSize: number;
  /** X offset in viewport coordinates. */
  x: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build a PretextPageLayout from pdfjs text content.
 *
 * Strategy:
 * 1. Convert pdfjs TextItem positions from PDF coords (origin bottom-left)
 *    to viewport coords (origin top-left).
 * 2. Group items by baseline Y into lines (±2px tolerance).
 * 3. Extract segment positions directly from pdfjs TextItem transforms.
 * 4. Detect column layout and cache on the result.
 *
 * @param textContentItems - `textContent.items` from pdfjs `page.getTextContent()`
 * @param viewportWidth - Viewport width in px (from `page.getViewport({ scale })`)
 * @param viewportHeight - Viewport height in px
 * @param pageNumber - Page number (1-based)
 * @param scale - The viewport scale factor
 */
export function buildPageLayout(
  textContentItems: Array<PdfTextItem | { str: '' }>,
  _viewportWidth: number,
  viewportHeight: number,
  pageNumber: number,
  scale: number,
): PretextPageLayout {
  // Filter to actual TextItems (pdfjs also emits empty marker objects)
  const items = textContentItems.filter(
    (item): item is PdfTextItem => 'transform' in item && item.str.length > 0,
  );

  if (items.length === 0) {
    return { pageNumber, lines: [], fullText: '', columnInfo: { isMultiColumn: false, columns: [] } };
  }

  // 1. Convert PDF coords to viewport coords and group by line
  const lineGroups = groupItemsByLine(items, viewportHeight, scale);

  // 2. Build line data with Pretext
  const lines: PretextLineData[] = [];
  for (const group of lineGroups) {
    const lineText = group.items.map((i) => i.str).join('');
    if (!lineText.trim()) continue;

    const lineHeight = group.fontSize * scale * 1.2;

    const top = viewportHeight - group.baselineY * scale - group.fontSize * scale;

    // Instead of using Pretext layout (which measures with its own font),
    // we extract segment positions directly from pdfjs TextItem transforms.
    // This is more accurate because pdfjs positions match the actual PDF rendering.
    const segments = buildSegmentsFromPdfItems(group.items, scale);

    lines.push({
      text: lineText,
      top,
      height: lineHeight,
      segments,
    });
  }

  const result: PretextPageLayout = {
    pageNumber,
    lines,
    fullText: lines.map((l) => l.text).join('\n'),
    columnInfo: { isMultiColumn: false, columns: [] }, // placeholder
  };
  result.columnInfo = detectColumns(result);
  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

const LINE_Y_TOLERANCE = 2; // px tolerance for grouping items into same line

/**
 * Group pdfjs TextItems by their baseline Y coordinate into lines.
 * pdfjs uses PDF coordinates: origin at bottom-left, Y increases upward.
 */
function groupItemsByLine(
  items: PdfTextItem[],
  _viewportHeight: number,
  scale: number,
): LineGroup[] {
  const groups: LineGroup[] = [];

  for (const item of items) {
    const baselineY = item.transform[5]; // PDF Y coordinate
    const fontSize = Math.abs(item.transform[0]); // scale from transform
    const x = item.transform[4] * scale; // viewport X

    // Find existing group with matching baseline (within tolerance)
    let matched = false;
    for (const group of groups) {
      const yDiff = Math.abs(group.baselineY - baselineY);
      if (yDiff <= LINE_Y_TOLERANCE / scale) {
        group.items.push(item);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({
        items: [item],
        baselineY,
        fontSize,
        x,
      });
    }
  }

  // Sort groups by baseline Y (descending in PDF coords = ascending in viewport)
  groups.sort((a, b) => b.baselineY - a.baselineY);

  return groups;
}

/**
 * Build segment data directly from pdfjs TextItem transforms.
 *
 * Each TextItem has `transform[4]` (X) and `transform[5]` (Y) in PDF coordinates,
 * plus `width` and `height` in viewport units. This is more accurate than using
 * Pretext for measurement since pdfjs positions exactly match the rendered PDF.
 */
function buildSegmentsFromPdfItems(
  items: PdfTextItem[],
  scale: number,
): PretextSegment[] {
  const segments: PretextSegment[] = [];

  // Sort items by X position (left to right)
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4]);

  for (const item of sorted) {
    if (!item.str.trim()) continue;

    // pdfjs TextItem.transform[4] is in PDF coordinates, needs * scale for viewport.
    // item.width is already in viewport-scaled units (per pdfjs spec), so don't re-scale.
    const left = item.transform[4] * scale;
    const width = item.width || (item.str.length * Math.abs(item.transform[0]) * scale);

    if (width < 1) continue;

    segments.push({
      text: item.str,
      left,
      width,
    });
  }

  // Merge adjacent segments that are close together (within 3px gap)
  if (segments.length <= 1) return segments;

  const merged: PretextSegment[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = segments[i];

    if (cur.left - (prev.left + prev.width) <= 3) {
      prev.text += cur.text;
      prev.width = cur.left + cur.width - prev.left;
    } else {
      merged.push(cur);
    }
  }

  return merged;
}
