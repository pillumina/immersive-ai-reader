import { ConversationHistory, Message } from '@/types/conversation';
import { generateId } from '@/lib/utils/crypto';
import { MAX_CONVERSATION_HISTORY } from '@/constants/limits';

/**
 * 获取或创建对话历史
 */
export async function getConversationHistory(
  db: IDBDatabase,
  documentId: string
): Promise<ConversationHistory> {
  return new Promise(async (resolve, reject) => {
    try {
      const tx = db.transaction(['conversations'], 'readwrite');
      const store = tx.objectStore('conversations');
      const index = store.index('documentId');
      const request = index.get(documentId);

      request.onsuccess = () => {
        let history = request.result;

        if (!history) {
          // 创建新的对话历史
          history = {
            id: generateId(),
            documentId,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const saveRequest = store.put(history);
          saveRequest.onsuccess = () => resolve(history);
          saveRequest.onerror = () => reject(saveRequest.error);
        } else {
          resolve(history);
        }
      };

      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 添加消息到对话历史
 */
export async function addMessageToHistory(
  db: IDBDatabase,
  documentId: string,
  message: Message
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const history = await getConversationHistory(db, documentId);

      // 添加消息
      history.messages.push({
        ...message,
        timestamp: message.timestamp || new Date(),
      });

      // 限制历史长度
      if (history.messages.length > MAX_CONVERSATION_HISTORY) {
        history.messages = history.messages.slice(-MAX_CONVERSATION_HISTORY);
      }

      // 更新时间戳
      history.updatedAt = new Date();

      // 保存
      const tx = db.transaction(['conversations'], 'readwrite');
      const store = tx.objectStore('conversations');
      const request = store.put(history);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}
