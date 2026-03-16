export const DB_NAME = 'ai-reader-db';
export const DB_VERSION = 1;

/**
 * 数据库迁移配置
 */
const migrations: Record<number, (db: IDBDatabase) => void> = {
  1: (db: IDBDatabase) => {
    // Documents store
    const documentStore = db.createObjectStore('documents', { keyPath: 'id' });
    documentStore.createIndex('createdAt', 'createdAt', { unique: false });
    documentStore.createIndex('fileName', 'fileName', { unique: false });

    // Annotations store
    const annotationStore = db.createObjectStore('annotations', { keyPath: 'id' });
    annotationStore.createIndex('documentId', 'documentId', { unique: false });
    annotationStore.createIndex('pageNumber', 'pageNumber', { unique: false });

    // Notes store
    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
    noteStore.createIndex('annotationId', 'annotationId', { unique: false });
    noteStore.createIndex('createdAt', 'createdAt', { unique: false });

    // Conversations store
    const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
    conversationStore.createIndex('documentId', 'documentId', { unique: false });
    conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });

    // Settings store
    db.createObjectStore('settings', { keyPath: 'key' });
  },
};

/**
 * 打开数据库(支持迁移)
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion || DB_VERSION;

      console.log(`Upgrading IndexedDB from version ${oldVersion} to ${newVersion}`);

      // 按顺序执行迁移
      for (let version = oldVersion + 1; version <= newVersion; version++) {
        const migration = migrations[version];
        if (migration) {
          console.log(`Running migration ${version}`);
          migration(db);
        }
      }
    };
  });
}
