import { Annotation } from '@/types/annotation';

/**
 * 保存标注
 */
export async function saveAnnotation(
  db: IDBDatabase,
  annotation: Annotation
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.put(annotation);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取文档的所有标注
 */
export async function getAnnotationsByDocument(
  db: IDBDatabase,
  documentId: string
): Promise<Annotation[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readonly');
    const store = tx.objectStore('annotations');
    const index = store.index('documentId');
    const request = index.getAll(documentId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除标注
 */
export async function deleteAnnotation(
  db: IDBDatabase,
  id: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
