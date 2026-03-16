import { openDB, DB_NAME, DB_VERSION } from '@/lib/storage/indexeddb';

describe('IndexedDB', () => {
  it('should open database with correct version', async () => {
    const db = await openDB();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    db.close();
  });

  it('should create all required object stores', async () => {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);

    expect(storeNames).toContain('documents');
    expect(storeNames).toContain('annotations');
    expect(storeNames).toContain('notes');
    expect(storeNames).toContain('conversations');
    expect(storeNames).toContain('settings');

    db.close();
  });
});
