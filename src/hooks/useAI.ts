import { useState, useCallback, useRef, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Message, MessageUsage } from '@/types/conversation';
import { aiCommands, conversationCommands } from '@/lib/tauri';
import { AIConfig, ChatInputMode } from '@/types/settings';

interface AIContext {
  currentPage?: number;
  selectedText?: string;
  documentTitle?: string;
}

type AIContextProvider = AIContext | (() => AIContext);
type RequestMode = ChatInputMode | 'term_light' | 'deep';
type RouteIntent = 'chat' | 'doc_qa' | 'term';
type PreferenceMode = 'chat' | 'doc';

interface RequestPlan {
  mode: Exclude<RequestMode, 'auto'>;
  historyWindow: number;
  selectedTextLimit: number;
}

interface RouteDecision {
  intent: RouteIntent;
  confidence: number;
}

interface RouteBias {
  chatBoost: number;
  docBoost: number;
}

interface CachedAnswer {
  content: string;
  usage?: MessageUsage;
  createdAt: number;
}

interface PendingRouteConfirmation {
  content: string;
  confidence: number;
  suggestedIntent: RouteIntent;
}

interface RoutePreferenceStats {
  chat: number;
  doc: number;
  total: number;
}

interface UseAIOptions {
  rememberRoutePreferenceAcrossSessions?: boolean;
}

const ROUTE_PREF_STORAGE_KEY_PREFIX = 'ai_route_preference_history_v2';

function getRoutePrefStorageKey(documentId: string): string {
  const scope = documentId?.trim() ? documentId.trim() : '__global__';
  return `${ROUTE_PREF_STORAGE_KEY_PREFIX}:${scope}`;
}

function isChitChatInput(content: string): boolean {
  const text = content.trim().toLowerCase();
  if (!text) return false;
  const tinyGreetings = new Set([
    'hi', 'hello', 'hey', 'yo', 'sup',
    '你好', '您好', '嗨', '哈喽', '早上好', '晚上好',
    '在吗', '在不在',
  ]);
  if (tinyGreetings.has(text)) return true;
  if (text.length <= 12) {
    return /^(hi+|hello+|hey+|你好+|您好+|嗨+|哈喽+)[!！?？]*$/.test(text);
  }
  return false;
}

function decideRoute(
  content: string,
  context: AIContext,
  mode: RequestMode,
  bias: RouteBias = { chatBoost: 0, docBoost: 0 }
): RouteDecision {
  if (mode === 'chat') return { intent: 'chat', confidence: 1 };
  if (mode === 'doc') return { intent: 'doc_qa', confidence: 1 };
  if (mode === 'term_light') return { intent: 'term', confidence: 1 };

  const text = content.trim();
  if (!text) return { intent: 'chat', confidence: 0.9 };
  if (isChitChatInput(text)) return { intent: 'chat', confidence: 0.98 };

  const lower = text.toLowerCase();
  let docScore = 0;
  let chatScore = 0;

  if (context.selectedText?.trim()) docScore += 1.2;
  if (context.currentPage && Number.isFinite(context.currentPage)) docScore += 0.35;
  if (context.documentTitle?.trim()) docScore += 0.2;

  const docHints = [
    '论文', 'paper', '文中', '这篇', '当前页', '这一段', '总结', '翻译', '解释',
    'method', 'result', '实验', '对比', '局限', '贡献', '结论',
  ];
  const chatHints = [
    '谢谢', '在吗', '你是谁', '天气', '笑话', '闲聊', '聊聊', 'how are you', 'thank',
  ];

  if (docHints.some((k) => lower.includes(k))) docScore += 1.1;
  if (chatHints.some((k) => lower.includes(k))) chatScore += 1.1;

  if (text.length > 20 && /[?？]/.test(text)) docScore += 0.5;
  if (text.length <= 12) chatScore += 0.6;
  docScore += bias.docBoost;
  chatScore += bias.chatBoost;

  const margin = docScore - chatScore;
  if (margin >= 0.8) {
    return { intent: 'doc_qa', confidence: Math.min(0.97, 0.65 + margin * 0.15) };
  }
  if (margin <= -0.4) {
    return { intent: 'chat', confidence: Math.min(0.97, 0.65 + Math.abs(margin) * 0.15) };
  }

  // Low-confidence auto route protects user experience:
  // ambiguous short inputs fallback to general chat, not document binding.
  return { intent: 'chat', confidence: 0.52 };
}

function pushPreference(history: PreferenceMode[], mode: PreferenceMode): PreferenceMode[] {
  const next = [...history, mode];
  return next.slice(-3);
}

function buildRouteBiasFromHistory(history: PreferenceMode[]): RouteBias {
  const chatCount = history.filter((m) => m === 'chat').length;
  const docCount = history.filter((m) => m === 'doc').length;
  const total = history.length;
  if (total === 0) return { chatBoost: 0, docBoost: 0 };
  // Keep bias light-touch: only nudge ambiguous cases.
  return {
    chatBoost: chatCount * 0.28,
    docBoost: docCount * 0.28,
  };
}

function buildPreferenceStats(history: PreferenceMode[]): RoutePreferenceStats {
  const chat = history.filter((m) => m === 'chat').length;
  const doc = history.filter((m) => m === 'doc').length;
  return { chat, doc, total: history.length };
}

export type Attachment = { id: string; type: 'text' | 'note'; content: string; page?: number };

function buildContextAwarePrompt(
  userInput: string,
  context: AIContext,
  plan: RequestPlan,
  attachments: Attachment[] = []
): string {
  const contextLines: string[] = [];
  if (context.documentTitle) contextLines.push(`Document: ${context.documentTitle}`);
  if (context.currentPage && Number.isFinite(context.currentPage)) {
    contextLines.push(`Current page: ${context.currentPage}`);
  }
  if (context.selectedText?.trim()) {
    // Keep selected context concise to reduce prompt token overhead.
    contextLines.push(`Selected text:\n${context.selectedText.trim().slice(0, plan.selectedTextLimit)}`);
  }

  const attachmentLines = attachments.map((a) => {
    const source = a.page ? `Page ${a.page}` : 'Unknown page';
    const label = a.type === 'text' ? 'Selected Text' : 'Note';
    return `[${label} (${source})]\n"${a.content}"`;
  });

  const citationInstruction = 'Use citations [ref:pN] for factual statements.';
  const modeInstruction = plan.mode === 'term_light'
    ? 'Task mode: term explain. Keep answer concise and structured: definition, intuition, and one practical example.'
    : plan.mode === 'deep'
      ? 'Task mode: deep analysis. Provide detailed reasoning, assumptions, and limitations.'
      : 'Task mode: balanced answer.';

  const parts: string[] = [modeInstruction];

  if (contextLines.length > 0 || attachmentLines.length > 0) {
    parts.push('[Reading Context]');
    if (contextLines.length > 0) parts.push(...contextLines);
    if (attachmentLines.length > 0) {
      parts.push('[Attached References]');
      parts.push(...attachmentLines);
    }
    parts.push('');
  }

  parts.push('[User Question]', userInput, '', citationInstruction);

  return parts.join('\n');
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

interface StreamChunkPayload {
  stream_id: string;
  delta: string;
}

interface StreamDonePayload {
  stream_id: string;
  content: string;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  stopped: boolean;
}

interface StreamErrorPayload {
  stream_id: string;
  message: string;
}

function buildHistoryForModel(messages: Message[], historyWindow: number): Message[] {
  return messages
    .filter((m) => m.status !== 'thinking' && m.content.trim().length > 0)
    .slice(-Math.max(1, historyWindow))
    .map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
}

function chooseRequestPlan(content: string, mode: RequestMode): RequestPlan {
  if (mode === 'chat') {
    return { mode: 'chat', historyWindow: 6, selectedTextLimit: 0 };
  }
  if (mode === 'doc') {
    return { mode: 'deep', historyWindow: 8, selectedTextLimit: 800 };
  }
  if (mode === 'term_light') {
    return { mode: 'term_light', historyWindow: 2, selectedTextLimit: 320 };
  }
  if (mode === 'deep') {
    return { mode: 'deep', historyWindow: 12, selectedTextLimit: 1200 };
  }

  const lower = content.toLowerCase();
  const deepHints = ['summarize', '总结', 'compare', '对比', 'methodology', 'limitations', 'critique', '分析', '详细'];
  const isDeep = content.length > 180 || deepHints.some((k) => lower.includes(k));
  if (isDeep) {
    return { mode: 'deep', historyWindow: 10, selectedTextLimit: 1000 };
  }
  return { mode: 'term_light', historyWindow: 4, selectedTextLimit: 500 };
}

function buildCacheKey(
  documentId: string,
  model: string,
  provider: string,
  content: string,
  context: AIContext,
  plan: RequestPlan,
  historyForModel: Message[],
  intent: RouteIntent
): string {
  const selected = (context.selectedText || '').trim().slice(0, 180);
  const historySig = historyForModel
    .slice(-2)
    .map((m) => `${m.role}:${m.content.trim().slice(0, 40).toLowerCase()}`)
    .join('||');
  return [
    provider,
    model,
    `i:${intent}`,
    documentId,
    `p:${context.currentPage || 0}`,
    `m:${plan.mode}`,
    `q:${content.trim().toLowerCase()}`,
    `s:${selected.toLowerCase()}`,
    `h:${historySig}`,
  ].join('|');
}

export function useAI(
  documentId: string,
  aiConfig: AIConfig,
  contextProvider: AIContextProvider = {},
  options: UseAIOptions = {}
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingRouteConfirmation, setPendingRouteConfirmation] = useState<PendingRouteConfirmation | null>(null);
  const [routePreferenceStats, setRoutePreferenceStats] = useState<RoutePreferenceStats>({ chat: 0, doc: 0, total: 0 });
  const activeRequestIdRef = useRef<number | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const routePreferenceHistoryRef = useRef<PreferenceMode[]>([]);
  const stopRequestedRef = useRef(false);
  const streamTimerRef = useRef<number | null>(null);
  const responseCacheRef = useRef<Map<string, CachedAnswer>>(new Map());
  const lastDocumentIdRef = useRef<string>(documentId);
  const messagesRef = useRef<Message[]>([]);
  // RAF-based streaming throttle: accumulate content in refs, flush to state at 60fps max.
  const streamingContentRef = useRef<string>('');
  const streamingAssistantIdRef = useRef<string | null>(null);
  // Micro-batch interval: flush accumulated content at ~20fps (50ms) for
  // a stable per-word feel without layout thrashing.
  const streamingFlushIntervalRef = useRef<number | null>(null);

  const rememberPreference = options.rememberRoutePreferenceAcrossSessions ?? true;

  const persistRoutePreferenceHistory = useCallback((history: PreferenceMode[]) => {
    if (!rememberPreference) return;
    try {
      localStorage.setItem(getRoutePrefStorageKey(documentId), JSON.stringify(history));
    } catch {
      // ignore persistence failures
    }
  }, [rememberPreference, documentId]);

  // Keep messagesRef in sync so sendMessage can read the latest without it as a dep.
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (documentId !== lastDocumentIdRef.current) {
      responseCacheRef.current.clear();
      lastDocumentIdRef.current = documentId;
      setPendingRouteConfirmation(null);
      routePreferenceHistoryRef.current = [];
      setRoutePreferenceStats({ chat: 0, doc: 0, total: 0 });
    }
  }, [documentId]);

  useEffect(() => {
    routePreferenceHistoryRef.current = [];
    setRoutePreferenceStats({ chat: 0, doc: 0, total: 0 });
    if (!rememberPreference) {
      return;
    }
    try {
      const raw = localStorage.getItem(getRoutePrefStorageKey(documentId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const sanitized = parsed
        .filter((v) => v === 'chat' || v === 'doc')
        .slice(-3) as PreferenceMode[];
      routePreferenceHistoryRef.current = sanitized;
      setRoutePreferenceStats(buildPreferenceStats(sanitized));
    } catch {
      // ignore malformed cache
    }
  }, [rememberPreference, documentId]);

  const stopGeneration = useCallback(() => {
    if (!isLoading) return;
    stopRequestedRef.current = true;
    const activeStreamId = activeStreamIdRef.current;
    if (activeStreamId) {
      void aiCommands.stopStreamMessage(activeStreamId);
    }
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (streamingFlushIntervalRef.current !== null) {
      window.clearInterval(streamingFlushIntervalRef.current);
      streamingFlushIntervalRef.current = null;
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

  const streamFromBackend = useCallback(async (
    assistantId: string,
    requestId: number,
    prompt: string,
    history: Message[],
  ): Promise<{ content: string; usage: MessageUsage; stopped: boolean }> => {
    // Reset streaming throttle refs at the start of each stream.
    streamingContentRef.current = '';
    streamingAssistantIdRef.current = null;
    if (streamingFlushIntervalRef.current !== null) {
      window.clearInterval(streamingFlushIntervalRef.current);
      streamingFlushIntervalRef.current = null;
    }

    let expectedStreamId: string | null = null;
    const streamStartedAt = Date.now();
    let firstTokenAt: number | null = null;
    let unlistenDone: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const unlistenChunk = await listen<StreamChunkPayload>('ai_stream_chunk', (event) => {
      if (!expectedStreamId || event.payload.stream_id !== expectedStreamId) return;
      if (activeRequestIdRef.current !== requestId) return;
      const delta = event.payload.delta || '';
      if (!delta) return;
      if (firstTokenAt === null) {
        firstTokenAt = Date.now();
      }
      streamingContentRef.current += delta;
      streamingAssistantIdRef.current = assistantId;

      // Flush at 50ms intervals — stable at ~20fps to avoid layout thrashing
      // while still feeling smooth for per-word streaming.
      if (streamingFlushIntervalRef.current === null) {
        streamingFlushIntervalRef.current = window.setInterval(() => {
          const content = streamingContentRef.current;
          const aid = streamingAssistantIdRef.current;
          if (aid) {
            setMessages((prev) => prev.map((m) =>
              m.id === aid ? { ...m, status: 'streaming', content } : m
            ));
          }
        }, 50);
      }
    });

    return await new Promise(async (resolve, reject) => {
      const cleanup = async () => {
        unlistenChunk();
        if (unlistenDone) unlistenDone();
        if (unlistenError) unlistenError();
        if (streamingFlushIntervalRef.current !== null) {
          window.clearInterval(streamingFlushIntervalRef.current);
          streamingFlushIntervalRef.current = null;
        }
      };

      unlistenDone = await listen<StreamDonePayload>('ai_stream_done', async (event) => {
        if (!expectedStreamId || event.payload.stream_id !== expectedStreamId) return;
        await cleanup();
        activeStreamIdRef.current = null;
        resolve({
          content: event.payload.content || streamingContentRef.current,
          usage: {
            latencyMs: normalizeTokenNumber(event.payload.latency_ms),
            ttftMs: firstTokenAt ? firstTokenAt - streamStartedAt : undefined,
            promptTokens: normalizeTokenNumber(event.payload.prompt_tokens),
            completionTokens: normalizeTokenNumber(event.payload.completion_tokens),
            totalTokens: normalizeTokenNumber(event.payload.total_tokens),
            model: aiConfig.model,
          },
          stopped: !!event.payload.stopped,
        });
      });

      unlistenError = await listen<StreamErrorPayload>('ai_stream_error', async (event) => {
        if (!expectedStreamId || event.payload.stream_id !== expectedStreamId) return;
        await cleanup();
        activeStreamIdRef.current = null;
        reject(new Error(event.payload.message || 'Stream request failed'));
      });

      try {
        const started = await aiCommands.startStreamMessage(
          aiConfig.provider,
          aiConfig.endpoint,
          aiConfig.model,
          aiConfig.apiKey,
          documentId,
          prompt,
          history
        );
        expectedStreamId = started.stream_id;
        activeStreamIdRef.current = expectedStreamId;
      } catch (error) {
        await cleanup();
        activeStreamIdRef.current = null;
        reject(error);
      }
    });
  }, [aiConfig, documentId]);

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
        }, 40);
      }),
    []
  );

  const sendMessage = useCallback(async (content: string, mode: RequestMode = 'auto', attachments: Attachment[] = []) => {
    const cleanContent = content.trim();
    if (!cleanContent) return;
    if (!aiConfig.apiKey) {
      setError('API key required');
      return;
    }
    if (mode === 'chat' || mode === 'doc') {
      routePreferenceHistoryRef.current = pushPreference(routePreferenceHistoryRef.current, mode);
      setRoutePreferenceStats(buildPreferenceStats(routePreferenceHistoryRef.current));
      persistRoutePreferenceHistory(routePreferenceHistoryRef.current);
    }

    if (mode === 'auto') {
      const precheckContext = resolveContext(contextProvider);
      const routePrecheck = decideRoute(
        cleanContent,
        precheckContext,
        mode,
        buildRouteBiasFromHistory(routePreferenceHistoryRef.current)
      );
      const shouldAskConfirm = !isChitChatInput(cleanContent) && routePrecheck.confidence < 0.68;
      if (shouldAskConfirm) {
        setPendingRouteConfirmation({
          content: cleanContent,
          confidence: routePrecheck.confidence,
          suggestedIntent: routePrecheck.intent,
        });
        return;
      }
    }
    setPendingRouteConfirmation(null);

    setIsLoading(true);
    setError(null);

    const userId = generateMessageId();
    const pendingAssistantId = generateMessageId();
    const userMessage: Message = {
      id: userId,
      role: 'user',
      content: cleanContent,
      timestamp: new Date(),
      status: 'sent',
    };
    const pendingAssistant: Message = {
      id: pendingAssistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
      requestContent: cleanContent,
      inputMode: mode === 'term_light' || mode === 'deep' ? 'auto' : mode,
    };
    setMessages(prev => [...prev, userMessage, pendingAssistant]);
    const requestId = Date.now();
    activeRequestIdRef.current = requestId;
    activeAssistantIdRef.current = pendingAssistantId;
    stopRequestedRef.current = false;

    try {
      const runtimeContext = resolveContext(contextProvider);
      const route = decideRoute(
        cleanContent,
        runtimeContext,
        mode,
        buildRouteBiasFromHistory(routePreferenceHistoryRef.current)
      );
      const isDocRoute = route.intent !== 'chat';
      const promptContext: AIContext = isDocRoute ? runtimeContext : {};
      const plan = chooseRequestPlan(cleanContent, mode);
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
        content: cleanContent,
      });

      const prompt = isDocRoute
        ? buildContextAwarePrompt(cleanContent, promptContext, plan, attachments)
        : (attachments.length > 0
            ? buildContextAwarePrompt(cleanContent, { selectedText: attachments.map(a => a.content).join('\n\n') }, plan)
            : cleanContent);
      const startedAt = Date.now();
      const historyForModel = buildHistoryForModel([...messagesRef.current, userMessage], plan.historyWindow);
      const cacheKey = buildCacheKey(
        documentId,
        aiConfig.model,
        aiConfig.provider,
        cleanContent,
        promptContext,
        plan,
        historyForModel,
        route.intent
      );
      const cached = responseCacheRef.current.get(cacheKey);
      const maxCacheAgeMs = 30 * 60 * 1000;
      if (isDocRoute && cached && Date.now() - cached.createdAt < maxCacheAgeMs) {
        const cachedUsage: MessageUsage = {
          ...(cached.usage || {}),
          latencyMs: 0,
          cached: true,
          model: cached.usage?.model || aiConfig.model,
        };
        const stoppedDuringStream = await streamAssistantText(
          pendingAssistantId,
          cached.content,
          requestId
        );
        if (stoppedDuringStream || stopRequestedRef.current || activeRequestIdRef.current !== requestId) {
          return;
        }
        const assistantMessage: Message = {
          id: pendingAssistantId,
          role: 'assistant',
          content: cached.content,
          timestamp: new Date(),
          status: 'sent',
          usage: cachedUsage,
          requestContent: cleanContent,
          routeIntent: route.intent,
          routeConfidence: route.confidence,
          inputMode: mode === 'term_light' || mode === 'deep' ? 'auto' : mode,
        };
        setMessages(prev => prev.map((m) => (
          m.id === pendingAssistantId ? assistantMessage : m
        )));
        return;
      }
      const streamResult = await streamFromBackend(
        pendingAssistantId,
        requestId,
        prompt,
        historyForModel
      );
      if (activeRequestIdRef.current !== requestId || stopRequestedRef.current) {
        return;
      }

      const latencyMs = Date.now() - startedAt;
      let assistantContent = streamResult.content;
      const usage: MessageUsage | undefined = {
        ...streamResult.usage,
        latencyMs: streamResult.usage.latencyMs ?? latencyMs,
      };
      if (isDocRoute) {
        assistantContent = ensureFallbackCitation(assistantContent, runtimeContext.currentPage);
        responseCacheRef.current.set(cacheKey, {
          content: assistantContent,
          usage,
          createdAt: Date.now(),
        });
      }

      if (streamResult.stopped || stopRequestedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      const assistantMessage: Message = {
        id: pendingAssistantId,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        status: 'sent',
        usage,
        requestContent: cleanContent,
        routeIntent: route.intent,
        routeConfidence: route.confidence,
        inputMode: mode === 'term_light' || mode === 'deep' ? 'auto' : mode,
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
          requestContent: cleanContent,
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
  }, [documentId, aiConfig, conversationId, contextProvider, streamAssistantText, streamFromBackend]);

  const retryAssistantMessage = useCallback(async (assistantMessageId: string, forcedMode?: ChatInputMode) => {
    const target = messages.find((m) => (
      m.id === assistantMessageId &&
      m.role === 'assistant' &&
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
      if (forcedMode === 'chat' || forcedMode === 'doc') {
        routePreferenceHistoryRef.current = pushPreference(routePreferenceHistoryRef.current, forcedMode);
        setRoutePreferenceStats(buildPreferenceStats(routePreferenceHistoryRef.current));
        persistRoutePreferenceHistory(routePreferenceHistoryRef.current);
      }
      const runtimeContext = resolveContext(contextProvider);
      const effectiveMode: RequestMode = forcedMode || target.inputMode || 'auto';
      const route = decideRoute(
        target.requestContent,
        runtimeContext,
        effectiveMode,
        buildRouteBiasFromHistory(routePreferenceHistoryRef.current)
      );
      const isDocRoute = route.intent !== 'chat';
      const promptContext: AIContext = isDocRoute ? runtimeContext : {};
      const plan = chooseRequestPlan(target.requestContent, effectiveMode);
      let convId = conversationId;
      if (!convId) {
        const conv = await conversationCommands.getOrCreate(documentId);
        convId = conv.id;
        setConversationId(convId);
      }
      if (!convId) throw new Error('Failed to create conversation');

      const prompt = isDocRoute
        ? buildContextAwarePrompt(target.requestContent, promptContext, plan)
        : target.requestContent.trim();
      const startedAt = Date.now();
      const historyForModel = buildHistoryForModel(messages, plan.historyWindow);
      const streamResult = await streamFromBackend(
        assistantMessageId,
        requestId,
        prompt,
        historyForModel
      );
      if (activeRequestIdRef.current !== requestId || stopRequestedRef.current) {
        return;
      }

      const latencyMs = Date.now() - startedAt;
      let assistantContent = streamResult.content;
      const usage: MessageUsage | undefined = {
        ...streamResult.usage,
        latencyMs: streamResult.usage.latencyMs ?? latencyMs,
      };
      if (isDocRoute) {
        assistantContent = ensureFallbackCitation(assistantContent, runtimeContext.currentPage);
      }
      if (streamResult.stopped || stopRequestedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      setMessages((prev) => prev.map((m) => (
        m.id === assistantMessageId
          ? {
              ...m,
              content: assistantContent,
              status: 'sent',
              usage,
              routeIntent: route.intent,
              routeConfidence: route.confidence,
              inputMode: forcedMode || target.inputMode || 'auto',
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
  }, [messages, aiConfig, contextProvider, conversationId, documentId, streamFromBackend]);

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
    responseCacheRef.current.clear();
  }, []);

  const explainTerm = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) {
      setError('No term selected');
      return;
    }
    await sendMessage(
      `Explain the term "${clean}" in current document context. Return: 1) definition, 2) why it matters here, 3) simple example.`,
      'term_light'
    );
  }, [sendMessage]);

  const confirmPendingRoute = useCallback(async (mode: ChatInputMode) => {
    if (!pendingRouteConfirmation) return;
    if (mode === 'chat' || mode === 'doc') {
      routePreferenceHistoryRef.current = pushPreference(routePreferenceHistoryRef.current, mode);
      setRoutePreferenceStats(buildPreferenceStats(routePreferenceHistoryRef.current));
      persistRoutePreferenceHistory(routePreferenceHistoryRef.current);
    }
    const content = pendingRouteConfirmation.content;
    setPendingRouteConfirmation(null);
    await sendMessage(content, mode);
  }, [pendingRouteConfirmation, sendMessage]);

  const dismissPendingRoute = useCallback(() => {
    setPendingRouteConfirmation(null);
  }, []);

  const clearRoutePreferenceMemory = useCallback(() => {
    routePreferenceHistoryRef.current = [];
    setRoutePreferenceStats({ chat: 0, doc: 0, total: 0 });
    try {
      localStorage.removeItem(getRoutePrefStorageKey(documentId));
    } catch {
      // ignore
    }
  }, [documentId]);

  return {
    messages,
    isLoading,
    error,
    pendingRouteConfirmation,
    routePreferenceStats,
    sendMessage,
    explainTerm,
    retryAssistantMessage,
    confirmPendingRoute,
    dismissPendingRoute,
    clearRoutePreferenceMemory,
    stopGeneration,
    loadHistory,
    clearHistory,
  };
}
