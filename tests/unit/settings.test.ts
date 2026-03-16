import { getSettings, saveSettings } from '@/lib/storage/settings';
import { openDB } from '@/lib/storage/indexeddb';

describe('Settings Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  it('should save and get settings', async () => {
    const testSettings = {
      provider: 'zhipu' as const,
      apiKey: 'test-api-key-123',
    };

    await saveSettings(db, 'ai', testSettings);
    const saved = await getSettings(db, 'ai');
    expect(saved).toEqual(testSettings);
  });

  it('should return undefined for non-existent settings', async () => {
    const settings = await getSettings(db, 'non-existent');
    expect(settings).toBeUndefined();
  });
});
