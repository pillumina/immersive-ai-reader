import { beforeAll, afterAll, afterEach } from 'vitest'
import fakeIndexedDB from 'fake-indexeddb'

// Mock IndexedDB for testing
beforeAll(() => {
  global.indexedDB = fakeIndexedDB as unknown as IDBFactory
})

afterEach(async () => {
  // Clean up databases after each test
  try {
    // fake-indexeddb doesn't support databases(), so we just delete the known database
    fakeIndexedDB.deleteDatabase('ai-reader-db')
  } catch (error) {
    // Ignore errors during cleanup
  }
})

afterAll(() => {
  // Clean up
})
