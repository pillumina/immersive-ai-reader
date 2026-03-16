import { fabric } from 'fabric';
import { COLORS } from '@/constants/colors';

export class CanvasManager {
  private canvas: fabric.Canvas;
  private zoomLevel: number = 1;

  constructor(canvasId: string) {
    this.canvas = new fabric.Canvas(canvasId, {
      selection: true,
      backgroundColor: COLORS.CANVAS_BG,
    });
  }

  addPage(canvasElement: HTMLCanvasElement, x: number, y: number) {
    const fabricImage = new fabric.Image(canvasElement, {
      left: x,
      top: y,
      selectable: false,
    });

    // Add border
    fabricImage.set('stroke', COLORS.PAGE_BORDER);
    fabricImage.set('strokeWidth', 2);

    this.canvas.add(fabricImage);
    this.canvas.renderAll();
  }

  addHighlight(x: number, y: number, width: number, height: number, color: string = COLORS.HIGHLIGHT_YELLOW) {
    const rect = new fabric.Rect({
      left: x,
      top: y,
      width,
      height,
      fill: color,
      opacity: 0.3,
      selectable: true,
    });

    this.canvas.add(rect);
    this.canvas.renderAll();
    return rect;
  }

  addNoteMarker(x: number, y: number, id: string) {
    const circle = new fabric.Circle({
      left: x,
      top: y,
      radius: 8,
      fill: COLORS.NOTE_MARKER_RED,
      selectable: true,
      data: { noteId: id },
    });

    this.canvas.add(circle);
    this.canvas.renderAll();
    return circle;
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel * 1.2, 3);
    this.canvas.setZoom(this.zoomLevel);
    this.canvas.renderAll();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.3);
    this.canvas.setZoom(this.zoomLevel);
    this.canvas.renderAll();
  }

  getCanvas() {
    return this.canvas;
  }

  dispose() {
    this.canvas.dispose();
  }
}
