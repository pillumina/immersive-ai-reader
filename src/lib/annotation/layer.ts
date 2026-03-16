import { Annotation, Note } from '@/types/annotation';
import { saveAnnotation, getAnnotationsByDocument, deleteAnnotation } from '@/lib/storage/annotations';
import { openDB } from '@/lib/storage/indexeddb';
import { generateId } from '@/lib/utils/crypto';
import { CanvasManager } from '@/lib/canvas/manager';

export class AnnotationLayer {
  private manager: CanvasManager;
  private documentId: string;

  constructor(manager: CanvasManager, documentId: string) {
    this.manager = manager;
    this.documentId = documentId;
  }

  async addHighlight(pageNumber: number, x: number, y: number, width: number, height: number, text: string, color?: string) {
    const annotation: Annotation = {
      id: generateId(),
      documentId: this.documentId,
      pageNumber,
      type: 'highlight',
      color: color || '#FEF08A',
      position: { x, y, width, height },
      text,
      createdAt: new Date(),
    };

    const db = await openDB();
    await saveAnnotation(db, annotation);

    // Add visual representation
    this.manager.addHighlight(x, y, width, height, color);

    return annotation;
  }

  async loadAnnotations() {
    const db = await openDB();
    const annotations = await getAnnotationsByDocument(db, this.documentId);

    // Render all annotations
    for (const annotation of annotations) {
      if (annotation.type === 'highlight') {
        this.manager.addHighlight(
          annotation.position.x,
          annotation.position.y,
          annotation.position.width,
          annotation.position.height,
          annotation.color
        );
      }
    }

    return annotations;
  }

  async removeAnnotation(id: string) {
    const db = await openDB();
    await deleteAnnotation(db, id);
  }
}
