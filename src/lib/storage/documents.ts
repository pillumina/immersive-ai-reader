import { PDFDocument } from '@/types/document';

/**
 * 保存文档
 */
export async function saveDocument(
  db: IDBDatabase,
  document: PDFDocument
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.put(document);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取单个文档
 */
export async function getDocument(
  db: IDBDatabase,
  id: string
): Promise<PDFDocument | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readonly');
    const store = tx.objectStore('documents');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有文档
 */
export async function getAllDocuments(
  db: IDBDatabase
): Promise<PDFDocument[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readonly');
    const store = tx.objectStore('documents');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除文档
 */
export async function deleteDocument(
  db: IDBDatabase,
  id: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
