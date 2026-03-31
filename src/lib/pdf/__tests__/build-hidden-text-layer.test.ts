import { describe, it, expect } from 'vitest';
import { type PretextSegment } from '../pretext-text-layer';

// Replicates the grouping logic from buildHiddenTextLayer for unit testing.
// Strategy: sort by left, greedily cluster consecutive segments within TOLERANCE px.
// Two segments are in the same group if they are ≤ TOLERANCE px apart (consecutive).
// This naturally handles columns: segments at ~40 (left col) vs ~325 (right col) → different groups.

const TOLERANCE = 5;

interface TestLine {
  top: number;
  segments: PretextSegment[];
}

/**
 * Greedy clustering by position: sort segments by left, then group consecutive
 * segments that are within TOLERANCE px of each other (gap ≤ TOLERANCE).
 * Segments separated by a gap > TOLERANCE start a new group.
 */
function clusterSegments(segments: PretextSegment[]): Array<{ left: number; segs: PretextSegment[] }> {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.left - b.left);
  const groups: Array<{ left: number; segs: PretextSegment[] }> = [{
    left: sorted[0].left,
    segs: [sorted[0]],
  }];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = groups[groups.length - 1].segs[groups[groups.length - 1].segs.length - 1];
    // Gap = distance from current segment's left to last segment's right edge
    if (curr.left - (last.left + last.width) <= TOLERANCE) {
      groups[groups.length - 1].segs.push(curr);
    } else {
      groups.push({ left: curr.left, segs: [curr] });
    }
  }
  return groups;
}

describe('buildHiddenTextLayer segment grouping logic', () => {
  describe('single column', () => {
    it('segments within 5px → one group', () => {
      // 40, 43, 45: gaps are 3px and 2px → all within TOLERANCE → one group
      const segments: PretextSegment[] = [
        { text: 'Hello', left: 40, width: 50 },
        { text: 'world', left: 43, width: 45 },
        { text: '!', left: 45, width: 5 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(1);
    });

    it('segments spaced >5px apart → separate groups', () => {
      // 40 and 95: gap = 95 - (40+50) = 5px → exactly TOLERANCE → same group
      // 40 and 96: gap = 96 - (40+50) = 6px → > TOLERANCE → different groups
      const segments: PretextSegment[] = [
        { text: 'Hello', left: 40, width: 50 },
        { text: 'world', left: 96, width: 45 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(2);
    });

    it('whitespace-only segments are skipped', () => {
      const segments: PretextSegment[] = [
        { text: 'Hello', left: 40, width: 50 },
        { text: '  ', left: 95, width: 10 },
        { text: 'world', left: 96, width: 45 },
      ];
      const groups = clusterSegments(segments.filter(s => s.text.trim()));
      expect(groups).toHaveLength(2); // Hello alone, world alone
    });
  });

  describe('two column', () => {
    it('left col (~40) vs right col (~325) → two groups', () => {
      // Left: 40+50=90, Right: 325, gap=325-90=235 > TOLERANCE
      const segments: PretextSegment[] = [
        { text: 'Left text', left: 40, width: 200 },
        { text: 'Right text', left: 325, width: 200 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(2);
      expect(groups[0].left).toBe(40);
      expect(groups[1].left).toBe(325);
    });

    it('multiple segments per column → one group per column', () => {
      // Left: 40, 85, gap=85-(40+50)=-15 → same group (overlapping!)
      // Actually 40+50=90, 85: 85-90=-5 → ≤5 → same group
      // Right: 325, 360: 360-(325+50)= -15 → same group
      const segments: PretextSegment[] = [
        { text: 'Word1', left: 40, width: 40 },
        { text: 'Word2', left: 85, width: 40 },
        { text: 'Word3', left: 325, width: 40 },
        { text: 'Word4', left: 360, width: 40 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(2); // left col (40+85), right col (325+360)
    });

    it('segments within 5px in same column → one group', () => {
      // Left: 40, 43; gap=43-(40+50)=-7 → same group
      const segments: PretextSegment[] = [
        { text: 'A', left: 40, width: 30 },
        { text: 'B', left: 43, width: 30 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(1);
    });
  });

  describe('tolerance boundaries', () => {
    it('segments at exactly 5px apart → same group', () => {
      // 40+10=50, 55: 55-50=5 → exactly TOLERANCE → same group
      const segments: PretextSegment[] = [
        { text: 'A', left: 40, width: 10 },
        { text: 'B', left: 55, width: 10 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(1);
    });

    it('segments at 6px apart → different groups', () => {
      // 40+10=50, 56: 56-50=6 > TOLERANCE → different groups
      const segments: PretextSegment[] = [
        { text: 'A', left: 40, width: 10 },
        { text: 'B', left: 56, width: 10 },
      ];
      const groups = clusterSegments(segments);
      expect(groups).toHaveLength(2);
    });
  });

  describe('realistic academic paper (40 lines, 2 columns)', () => {
    it('20 lines × 2 columns → correct group count per line', () => {
      const lines: TestLine[] = [];
      for (let i = 0; i < 20; i++) {
        const top = i * 20;
        lines.push({
          top,
          segments: [
            // Left column: 2 segments at ~40 and ~125 (gap=85 > TOLERANCE → 2 groups?)
            // Wait: 40+80=120, 125: 125-120=5 → exactly TOLERANCE → same group
            // Hmm, 40px word + 5px gap = 125. That's TOLERANCE. Same group.
            { text: `La${i}`, left: 40, width: 80 },
            { text: `Lb${i}`, left: 125, width: 80 },
            // Right column: 2 segments at ~325 and ~410 (gap=5 → same group)
            { text: `Ra${i}`, left: 325, width: 80 },
            { text: `Rb${i}`, left: 410, width: 80 },
          ],
        });
      }
      // For each line: segments at 40,125,325,410
      // 40+80=120, 125: 125-120=5 → same group (within TOLERANCE)
      // 125+80=205, 325: 325-205=120 > TOLERANCE → new group
      // 325+80=405, 410: 410-405=5 → same group
      // So: group1={40,125}, group2={325,410} → 2 groups per line ✓
      lines.forEach(({ segments }) => {
        const groups = clusterSegments(segments);
        expect(groups).toHaveLength(2);
        expect(groups[0].left).toBe(40);
        expect(groups[1].left).toBe(325);
      });
    });
  });
});
