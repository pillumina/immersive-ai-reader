/**
 * 获取设置
 */
export async function getSettings<T = any>(
  db: IDBDatabase,
  key: string
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result?.value);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存设置
 */
export async function saveSettings<T = any>(
  db: IDBDatabase,
  key: string,
  value: T
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
