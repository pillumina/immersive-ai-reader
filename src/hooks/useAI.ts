import { useState, useCallback } from 'react';
import { Message } from '@/types/conversation';
import { getConversationHistory, addMessageToHistory } from '@/lib/storage/conversations';
import { openDB } from '@/lib/storage/indexeddb';

export function useAI(documentId: string, provider: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!apiKey) {
      setError('API key required');
      return;
    }

    setIsLoading(true);
    setError(null);

    const userMessage: Message = { role: 'user', content, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);

    try {
      const db = await openDB();

      // Save user message
      await addMessageToHistory(db, documentId, userMessage);

      // Get conversation history
      const history = await getConversationHistory(db, documentId);

      // Call API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          documentId,
          provider,
          apiKey,
          history: history.messages.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantContent += decoder.decode(value);
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      await addMessageToHistory(db, documentId, assistantMessage);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, provider, apiKey]);

  const loadHistory = useCallback(async () => {
    try {
      const db = await openDB();
      const history = await getConversationHistory(db, documentId);
      setMessages(history.messages);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [documentId]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    loadHistory,
    clearHistory,
  };
}
