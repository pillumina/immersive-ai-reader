import { saveDocument, getDocument, getAllDocuments, deleteDocument } from '@/lib/storage/documents';
import { PDFDocument } from '@/types/document';
import { openDB } from '@/lib/storage/indexeddb';

describe('Documents Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  const testDoc: PDFDocument = {
    id: 'test-doc-1',
    fileName: 'test.pdf',
    fileSize: 1024,
    pageCount: 10,
    textContent: 'Test content',
    fileBlob: new Blob(['test'], { type: 'application/pdf' }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should save a document', async () => {
    await saveDocument(db, testDoc);
    const saved = await getDocument(db, testDoc.id);
    expect(saved).toBeTruthy();
    expect(saved?.fileName).toBe('test.pdf');
  });

  it('should get all documents', async () => {
    const docs = await getAllDocuments(db);
    expect(docs.length).toBeGreaterThan(0);
  });

  it('should delete a document', async () => {
    await deleteDocument(db, testDoc.id);
    const deleted = await getDocument(db, testDoc.id);
    expect(deleted).toBeUndefined();
  });
});
