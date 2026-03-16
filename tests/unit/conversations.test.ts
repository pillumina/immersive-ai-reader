import {
  getConversationHistory,
  addMessageToHistory,
} from '@/lib/storage/conversations';
import { openDB } from '@/lib/storage/indexeddb';
import { Message } from '@/types/conversation';

describe('Conversations Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  const documentId = 'test-doc-1';
  const message1: Message = {
    role: 'user',
    content: 'What is this document about?',
    timestamp: new Date(),
  };
  const message2: Message = {
    role: 'assistant',
    content: 'This document is about AI technology.',
    timestamp: new Date(),
  };

  it('should get or create conversation history', async () => {
    const history = await getConversationHistory(db, documentId);
    expect(history).toBeTruthy();
    expect(history.documentId).toBe(documentId);
    expect(history.messages).toEqual([]);
  });

  it('should add messages to history', async () => {
    await addMessageToHistory(db, documentId, message1);
    await addMessageToHistory(db, documentId, message2);

    const history = await getConversationHistory(db, documentId);
    expect(history.messages.length).toBe(2);
    expect(history.messages[0].content).toBe('What is this document about?');
    expect(history.messages[1].content).toBe('This document is about AI technology.');
  });
});
