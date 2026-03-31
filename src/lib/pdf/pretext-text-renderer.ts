/**
 * PretextTextRenderer — Transparent canvas text layer for hit-testing extension.
 *
 * Architecture:
 * - PDF canvas renders visible text (pdfjs page.render)
 * - .pdf-text-layer (hidden DOM) handles native text selection + Ctrl+F
 * - This canvas is transparent (globalAlpha=0) — no visual output
 *
 * The canvas exists as a layer between PDF canvas and highlight layer,
 * ready for future extensions:
 * - Text-level hit testing (point → text character)
 * - Visual text selection overlay (blue highlight on canvas)
 * - Custom text rendering with matched fonts
 *
 * Font note: visual text is rendered by pdfjs page.render on the PDF canvas.
 * Drawing text here requires font substitution mapping (pdfjs font names → web fonts),
 * which is non-trivial for CJK/scripts. Deferred to future extension.
 */

import type { PretextPageLayout } from './pretext-text-layer';

export class PretextTextRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(pageEl: HTMLElement, width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pretext-text-canvas';
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText =
      `position:absolute;top:0;left:0;width:${width}px;height:${height}px;` +
      `pointer-events:none;z-index:1;`;
    this.ctx = this.canvas.getContext('2d')!;
    // Transparent: no visual output. Ready for future text rendering extension.
    this.ctx.globalAlpha = 0;
    pageEl.appendChild(this.canvas);
  }

  /**
   * Called after PretextPageLayout is built.
   * Currently draws nothing (globalAlpha=0).
   *
   * Future: render text here with font substitution for:
   * - Text-level selection overlay (blue highlight on canvas)
   * - Character-level hit testing
   */
  renderLayout(_layout: PretextPageLayout): void {
    // globalAlpha=0: draws nothing.
    // Extension point: iterate layout.lines, draw each segment with
    // matched font. Requires pdfjs font name → CSS font-family mapping.
  }

  destroy(): void {
    this.canvas.remove();
  }
}
