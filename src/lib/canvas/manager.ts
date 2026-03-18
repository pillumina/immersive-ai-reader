import * as fabric from 'fabric';
import { COLORS } from '@/constants/colors';

export class CanvasManager {
  private canvas: fabric.Canvas;
  private zoomLevel: number = 1;

  constructor(canvasId: string) {
    const canvasElement = globalThis.document?.getElementById(canvasId);
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas element not found: ${canvasId}`);
    }

    this.canvas = new fabric.Canvas(canvasElement, {
      selection: true,
      backgroundColor: COLORS.CANVAS_BG,
      width: 800,
      height: 600,
    });

    // Make sure canvas wrapper doesn't constrain size
    const wrapper = this.canvas.wrapperEl;
    if (wrapper) {
      wrapper.style.display = 'block';
    }
  }

  addPage(canvasElement: HTMLCanvasElement, x: number, y: number) {
    console.log(`CanvasManager.addPage called: x=${x}, y=${y}, canvasElement=${canvasElement.width}x${canvasElement.height}`);

    const fabricImage = new fabric.Image(canvasElement, {
      left: x,
      top: y,
      selectable: false,
      width: canvasElement.width,
      height: canvasElement.height,
    });

    console.log('Fabric.Image created:', {
      left: fabricImage.left,
      top: fabricImage.top,
      width: fabricImage.width,
      height: fabricImage.height,
      scaleX: fabricImage.scaleX,
      scaleY: fabricImage.scaleY,
    });

    // Add border
    fabricImage.set('stroke', COLORS.PAGE_BORDER);
    fabricImage.set('strokeWidth', 2);

    this.canvas.add(fabricImage);

    console.log('Object added to canvas. Total objects:', this.canvas.getObjects().length);

    // Update canvas dimensions to fit all pages
    this.updateCanvasDimensions();

    this.canvas.renderAll();
    console.log('Canvas rendered');
  }

  private updateCanvasDimensions() {
    const objects = this.canvas.getObjects();
    if (objects.length === 0) return;

    let maxX = 0;
    let maxY = 0;

    objects.forEach((obj) => {
      const objRight = (obj.left || 0) + (obj.width || 0) * (obj.scaleX || 1);
      const objBottom = (obj.top || 0) + (obj.height || 0) * (obj.scaleY || 1);
      maxX = Math.max(maxX, objRight);
      maxY = Math.max(maxY, objBottom);
    });

    // Add padding
    const padding = 40;
    this.canvas.setWidth(maxX + padding);
    this.canvas.setHeight(maxY + padding);
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
