import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDB } from '@/lib/storage/indexeddb';
import { saveDocument, getDocument } from '@/lib/storage/documents';
import { PDFDocument } from '@/types/document';

describe('PDF Upload Flow', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  it('should complete full upload flow', async () => {
    const testDoc: PDFDocument = {
      id: 'integration-test-1',
      fileName: 'test.pdf',
      fileSize: 2048,
      pageCount: 5,
      textContent: 'This is test content for integration testing.',
      fileBlob: new Blob(['test pdf content'], { type: 'application/pdf' }),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save document
    await saveDocument(db, testDoc);

    // Retrieve document
    const retrieved = await getDocument(db, testDoc.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.fileName).toBe('test.pdf');
    expect(retrieved?.pageCount).toBe(5);
    expect(retrieved?.textContent).toContain('integration testing');
  });
});
