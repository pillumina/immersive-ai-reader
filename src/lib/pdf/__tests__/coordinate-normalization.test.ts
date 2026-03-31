import { describe, it, expect } from 'vitest';

/**
 * Tests for scale-independent coordinate normalization.
 *
 * Design: positions are stored as fractions (0.0–1.0) of page dimensions.
 * - Save:  nx = x / pageWidth,  ny = y / pageHeight
 * - Load:  px = nx * currentPageWidth, py = ny * currentPageHeight
 *
 * Legacy detection: position_x <= 1 AND position_width <= 1 → normalized (new)
 *                   otherwise → raw pixels (legacy)
 */

describe('coordinate normalization math', () => {
  describe('normalized fraction round-trip', () => {
    it('preserves highlight position across zoom levels', () => {
      // Simulate a highlight at x=100, y=50 on a 600x800 page at zoom 1.0
      const pageW = 600, pageH = 800;
      const x = 100, y = 50, w = 200, h = 16;

      // Save: normalize to fractions
      const nx = x / pageW, ny = y / pageH, nw = w / pageW, nh = h / pageH;
      expect(nx).toBeCloseTo(0.1667, 3);
      expect(ny).toBeCloseTo(0.0625, 4);
      expect(nw).toBeCloseTo(0.3333, 3);
      expect(nh).toBeCloseTo(0.02, 3);

      // Load at zoom 1.5: page is 900x1200
      const newW = 900, newH = 1200;
      const px = nx * newW, py = ny * newH, pw = nw * newW, ph = nh * newH;
      expect(px).toBeCloseTo(150, 0);  // 100 * 1.5
      expect(py).toBeCloseTo(75, 0);    // 50 * 1.5
      expect(pw).toBeCloseTo(300, 0);  // 200 * 1.5
      expect(ph).toBeCloseTo(24, 0);   // 16 * 1.5
    });

    it('handles edge highlights (full width)', () => {
      const pageW = 500;
      const x = 0, w = 500;
      const nx = x / pageW, nw = w / pageW;
      expect(nx).toBe(0);
      expect(nw).toBe(1);

      // At any zoom
      const px = nx * 750, pw = nw * 750;
      expect(px).toBe(0);
      expect(pw).toBe(750); // full width at new zoom
    });

    it('handles tiny highlights correctly', () => {
      const pageW = 600, pageH = 800;
      const x = 0.1, y = 0.05; // tiny pixel values
      const nx = x / pageW, ny = y / pageH;
      // These would be normalized fractions (new format)
      // At 2x zoom (1200x1600)
      const px = nx * 1200, py = ny * 1600;
      expect(px).toBeCloseTo(0.2, 1);
      expect(py).toBeCloseTo(0.1, 1);
    });
  });

  describe('legacy detection', () => {
    it('treats position_x > 1 as legacy pixels', () => {
      // Legacy: stored as 100px at base zoom
      const storedX = 100;
      const threshold = 1;
      const isLegacy = storedX > threshold;
      expect(isLegacy).toBe(true);
    });

    it('treats normalized fractions correctly (x <= 1 and w <= 1)', () => {
      // New format: stored as fractions
      const storedX = 0.1667;
      const storedW = 0.3333;
      const threshold = 1;
      const isLegacy = storedX > threshold || storedW > threshold;
      expect(isLegacy).toBe(false);
    });

    it('legacy detection uses both x and w to avoid false positives', () => {
      // Edge case: x=0.5 (fraction) but w=100 (pixels)
      const storedX = 0.5, storedW = 100;
      const isLegacy = storedX > 1 || storedW > 1;
      expect(isLegacy).toBe(true); // detected as legacy due to w
    });
  });

  describe('legacy conversion', () => {
    it('converts legacy pixels assuming base effectiveScale 1.25', () => {
      // User created highlight at zoom 1.0 → effectiveScale = 1.25
      // Page at zoom 1.0: 600x800 (viewport)
      // Stored position: 100px (at zoom 1.0)
      const legacyX = 100;
      // pageEl.offsetWidth at current zoom = viewportWidth * zoomLevel
      // At zoom 1.0: pageW = 600 * 1.25 = 750
      // Legacy pixels are at effectiveScale 1.25, so:
      // fraction = 100 / (pageW_at_effectiveScale)
      // But we don't know the exact pageW — we approximate using current page dims
      // Current page (zoom 1.0): pageEl.offsetWidth = 600 * 1.25 = 750
      // Legacy fraction = 100 / 750 ≈ 0.133
      const currentPageW = 750;
      const legacyFraction = legacyX / currentPageW;
      expect(legacyFraction).toBeCloseTo(0.1333, 3);
    });

    it('normalized fractions survive zoom changes correctly', () => {
      const pageW100 = 600;    // page width at zoom 1.0
      const zoom = 1.5;
      const pageW150 = pageW100 * zoom; // 900

      // Create at zoom 1.0
      const x = 100;
      const nx = x / pageW100;  // 100/600 ≈ 0.1667

      // Load at zoom 1.5
      const px = nx * pageW150;  // 0.1667 * 900 = 150
      expect(px).toBeCloseTo(x * zoom, 0);  // correct: scaled by zoom
    });
  });
});
