import {
  saveAnnotation,
  getAnnotationsByDocument,
  deleteAnnotation,
} from '@/lib/storage/annotations';
import { Annotation } from '@/types/annotation';
import { openDB } from '@/lib/storage/indexeddb';

describe('Annotations Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  const testAnnotation: Annotation = {
    id: 'anno-1',
    documentId: 'doc-1',
    pageNumber: 1,
    type: 'highlight',
    color: '#FEF08A',
    position: { x: 100, y: 100, width: 200, height: 20 },
    text: 'Highlighted text',
    createdAt: new Date(),
  };

  it('should save an annotation', async () => {
    await saveAnnotation(db, testAnnotation);
    const saved = await getAnnotationsByDocument(db, 'doc-1');
    expect(saved.length).toBe(1);
    expect(saved[0].text).toBe('Highlighted text');
  });

  it('should delete an annotation', async () => {
    await deleteAnnotation(db, 'anno-1');
    const saved = await getAnnotationsByDocument(db, 'doc-1');
    expect(saved.length).toBe(0);
  });
});
