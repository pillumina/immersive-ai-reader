import { useState, useCallback, useRef } from 'react';
import { Message, MessageUsage } from '@/types/conversation';
import { aiCommands, conversationCommands } from '@/lib/tauri';
import { AIConfig } from '@/types/settings';

interface AIContext {
  currentPage?: number;
  selectedText?: string;
  documentTitle?: string;
}

type AIContextProvider = AIContext | (() => AIContext);

function buildContextAwarePrompt(userInput: string, context: AIContext): string {
  const contextLines: string[] = [];
  if (context.documentTitle) contextLines.push(`Document: ${context.documentTitle}`);
  if (context.currentPage && Number.isFinite(context.currentPage)) {
    contextLines.push(`Current page: ${context.currentPage}`);
  }
  if (context.selectedText?.trim()) {
    contextLines.push(`Selected text:\n${context.selectedText.trim().slice(0, 2000)}`);
  }

  const citationInstruction =
    'When giving factual answers, add source markers in format [ref:p<pageNumber>], e.g. [ref:p3].';
  if (contextLines.length === 0) {
    return `${userInput}\n\n${citationInstruction}`;
  }

  return [
    '[Reading Context]',
    ...contextLines,
    '',
    '[User Question]',
    userInput,
    '',
    citationInstruction,
  ].join('\n');
}

function ensureFallbackCitation(content: string, currentPage?: number): string {
  if (!currentPage || !Number.isFinite(currentPage)) return content;
  const hasRef = /\[ref:p\d+\]/i.test(content) || /\[p\d+\]/i.test(content);
  if (hasRef) return content;
  return `${content}\n\nSource: [ref:p${currentPage}]`;
}

function resolveContext(provider: AIContextProvider): AIContext {
  if (typeof provider === 'function') {
    return provider();
  }
  return provider;
}

function unwrapUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybe = err as Record<string, unknown>;
    if (typeof maybe.message === 'string') return maybe.message;
    try {
      return JSON.stringify(maybe);
    } catch {
      return 'Failed to send message';
    }
  }
  return 'Failed to send message';
}

function generateMessageId() {
  return globalThis.crypto?.randomUUID?.() || `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeTokenNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractUsage(parsed: any, latencyMs: number): MessageUsage | undefined {
  const usage = parsed?.usage || parsed?.token_usage || parsed?.meta?.usage || null;
  const promptTokens =
    normalizeTokenNumber(usage?.prompt_tokens) ??
    normalizeTokenNumber(usage?.input_tokens) ??
    normalizeTokenNumber(usage?.promptTokens);
  const completionTokens =
    normalizeTokenNumber(usage?.completion_tokens) ??
    normalizeTokenNumber(usage?.output_tokens) ??
    normalizeTokenNumber(usage?.completionTokens);
  const totalTokens =
    normalizeTokenNumber(usage?.total_tokens) ??
    normalizeTokenNumber(usage?.totalTokens) ??
    (typeof promptTokens === 'number' || typeof completionTokens === 'number'
      ? (promptTokens || 0) + (completionTokens || 0)
      : undefined);

  const hasAnyToken =
    typeof promptTokens === 'number' ||
    typeof completionTokens === 'number' ||
    typeof totalTokens === 'number';

  if (!hasAnyToken && !parsed?.model) {
    return { latencyMs };
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
    model: typeof parsed?.model === 'string' ? parsed.model : undefined,
  };
}

function buildHistoryForModel(messages: Message[]): Message[] {
  return messages
    .filter((m) => m.status !== 'thinking' && m.content.trim().length > 0)
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
}

export function useAI(documentId: string, aiConfig: AIConfig, contextProvider: AIContextProvider = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const streamTimerRef = useRef<number | null>(null);

  const stopGeneration = useCallback(() => {
    if (!isLoading) return;
    stopRequestedRef.current = true;
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    const assistantId = activeAssistantIdRef.current;
    if (assistantId) {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== assistantId) return m;
        return {
          ...m,
          status: 'sent',
          content: m.content.trim() ? m.content : 'Generation stopped.',
        };
      }));
    }
    setIsLoading(false);
  }, [isLoading]);

  const streamAssistantText = useCallback(
    (assistantId: string, fullText: string, requestId: number) =>
      new Promise<boolean>((resolve) => {
        if (!fullText) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: 'sent', content: '' } : m))
          );
          resolve(false);
          return;
        }

        let cursor = 0;
        const step = Math.max(4, Math.ceil(fullText.length / 140));
        streamTimerRef.current = window.setInterval(() => {
          const isInvalidRequest =
            activeRequestIdRef.current !== requestId || stopRequestedRef.current;
          if (isInvalidRequest) {
            if (streamTimerRef.current !== null) {
              window.clearInterval(streamTimerRef.current);
              streamTimerRef.current = null;
            }
            resolve(true);
            return;
          }

          cursor = Math.min(cursor + step, fullText.length);
          const chunk = fullText.slice(0, cursor);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, status: cursor >= fullText.length ? 'sent' : 'streaming', content: chunk }
                : m
            )
          );

          if (cursor >= fullText.length) {
            if (streamTimerRef.current !== null) {
              window.clearInterval(streamTimerRef.current);
              streamTimerRef.current = null;
            }
            resolve(false);
          }
        }, 24);
      }),
    []
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!aiConfig.apiKey) {
      setError('API key required');
      return;
    }

    setIsLoading(true);
    setError(null);

    const userId = generateMessageId();
    const pendingAssistantId = generateMessageId();
    const userMessage: Message = {
      id: userId,
      role: 'user',
      content,
      timestamp: new Date(),
      status: 'sent',
    };
    const pendingAssistant: Message = {
      id: pendingAssistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
      requestContent: content,
    };
    setMessages(prev => [...prev, userMessage, pendingAssistant]);
    const requestId = Date.now();
    activeRequestIdRef.current = requestId;
    activeAssistantIdRef.current = pendingAssistantId;
    stopRequestedRef.current = false;

    try {
      const runtimeContext = resolveContext(contextProvider);
      // Get or create conversation
      let convId = conversationId;
      if (!convId) {
        const conv = await conversationCommands.getOrCreate(documentId);
        convId = conv.id;
        setConversationId(convId);
      }
      if (!convId) {
        throw new Error('Failed to create conversation');
      }

      // Save user message
      await conversationCommands.addMessage({
        conversation_id: convId,
        role: 'user',
        content,
      });

      const prompt = buildContextAwarePrompt(content, runtimeContext);
      const startedAt = Date.now();
      const historyForModel = buildHistoryForModel([...messages, userMessage]);
      // Call AI API via Tauri command
      const response = await aiCommands.sendMessage(
        aiConfig.provider,
        aiConfig.endpoint,
        aiConfig.model,
        aiConfig.apiKey,
        documentId,
        prompt,
        historyForModel
      );
      const latencyMs = Date.now() - startedAt;
      if (activeRequestIdRef.current !== requestId || stopRequestedRef.current) {
        return;
      }

      // Parse response (assuming it's JSON)
      let assistantContent = response;
      let usage: MessageUsage | undefined = { latencyMs };
      try {
        const parsed = JSON.parse(response);
        // Extract content based on provider response format
        if (parsed.choices?.[0]?.message?.content) {
          assistantContent = parsed.choices[0].message.content;
        } else if (typeof parsed.reply === 'string') {
          assistantContent = parsed.reply;
        }
        usage = extractUsage(parsed, latencyMs);
      } catch {
        // If not JSON, use raw response
      }
      assistantContent = ensureFallbackCitation(assistantContent, runtimeContext.currentPage);

      const stoppedDuringStream = await streamAssistantText(
        pendingAssistantId,
        assistantContent,
        requestId
      );
      if (stoppedDuringStream || stopRequestedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      const assistantMessage: Message = {
        id: pendingAssistantId,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        status: 'sent',
        usage,
        requestContent: content,
      };

      setMessages(prev => prev.map((m) => (
        m.id === pendingAssistantId ? assistantMessage : m
      )));

      // Save assistant message
      await conversationCommands.addMessage({
        conversation_id: convId,
        role: 'assistant',
        content: assistantContent,
      });

    } catch (err) {
      if (stopRequestedRef.current) {
        return;
      }
      console.error('sendMessage failed (raw):', err);
      const message = unwrapUnknownError(err);
      setMessages(prev => prev.map((m) => {
        if (m.id !== pendingAssistantId) return m;
        return {
          ...m,
          status: 'error',
          content: message,
          usage: m.usage || undefined,
          requestContent: content,
        };
      }));
      setError(message);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        activeAssistantIdRef.current = null;
        stopRequestedRef.current = false;
      }
      setIsLoading(false);
    }
  }, [documentId, aiConfig, messages, conversationId, contextProvider, streamAssistantText]);

  const retryAssistantMessage = useCallback(async (assistantMessageId: string) => {
    const target = messages.find((m) => (
      m.id === assistantMessageId &&
      m.role === 'assistant' &&
      m.status === 'error' &&
      !!m.requestContent?.trim()
    ));
    if (!target || !target.requestContent) return;
    if (!aiConfig.apiKey) {
      setError('API key required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessages((prev) => prev.map((m) => (
      m.id === assistantMessageId
        ? { ...m, status: 'thinking', content: '', usage: undefined }
        : m
    )));
    const requestId = Date.now();
    activeRequestIdRef.current = requestId;
    activeAssistantIdRef.current = assistantMessageId;
    stopRequestedRef.current = false;

    try {
      const runtimeContext = resolveContext(contextProvider);
      let convId = conversationId;
      if (!convId) {
        const conv = await conversationCommands.getOrCreate(documentId);
        convId = conv.id;
        setConversationId(convId);
      }
      if (!convId) throw new Error('Failed to create conversation');

      const prompt = buildContextAwarePrompt(target.requestContent, runtimeContext);
      const startedAt = Date.now();
      const historyForModel = buildHistoryForModel(messages);
      const response = await aiCommands.sendMessage(
        aiConfig.provider,
        aiConfig.endpoint,
        aiConfig.model,
        aiConfig.apiKey,
        documentId,
        prompt,
        historyForModel
      );
      const latencyMs = Date.now() - startedAt;
      if (activeRequestIdRef.current !== requestId || stopRequestedRef.current) {
        return;
      }

      let assistantContent = response;
      let usage: MessageUsage | undefined = { latencyMs };
      try {
        const parsed = JSON.parse(response);
        if (parsed.choices?.[0]?.message?.content) {
          assistantContent = parsed.choices[0].message.content;
        } else if (typeof parsed.reply === 'string') {
          assistantContent = parsed.reply;
        }
        usage = extractUsage(parsed, latencyMs);
      } catch {
        // keep raw response
      }
      assistantContent = ensureFallbackCitation(assistantContent, runtimeContext.currentPage);

      const stoppedDuringStream = await streamAssistantText(
        assistantMessageId,
        assistantContent,
        requestId
      );
      if (stoppedDuringStream || stopRequestedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      setMessages((prev) => prev.map((m) => (
        m.id === assistantMessageId
          ? {
              ...m,
              content: assistantContent,
              status: 'sent',
              usage,
            }
          : m
      )));

      await conversationCommands.addMessage({
        conversation_id: convId,
        role: 'assistant',
        content: assistantContent,
      });
    } catch (err) {
      if (stopRequestedRef.current) {
        return;
      }
      console.error('retryAssistantMessage failed (raw):', err);
      const message = unwrapUnknownError(err);
      setMessages((prev) => prev.map((m) => (
        m.id === assistantMessageId
          ? { ...m, status: 'error', content: message }
          : m
      )));
      setError(message);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        activeAssistantIdRef.current = null;
        stopRequestedRef.current = false;
      }
      setIsLoading(false);
    }
  }, [messages, aiConfig, contextProvider, conversationId, documentId, streamAssistantText]);

  const loadHistory = useCallback(async () => {
    try {
      // Get or create conversation
      const conv = await conversationCommands.getOrCreate(documentId);
      setConversationId(conv.id);

      // Load messages
      const msgs = await conversationCommands.getMessages(conv.id);
      const frontendMessages: Message[] = msgs.map(m => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        status: 'sent',
      }));
      setMessages(frontendMessages);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [documentId]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    retryAssistantMessage,
    stopGeneration,
    loadHistory,
    clearHistory,
  };
}
