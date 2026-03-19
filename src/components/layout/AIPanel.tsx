import { DragEvent, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Check, Copy, GripVertical, Loader2, MapPin, Pin, RotateCcw, Square, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/conversation';
import { ChatInputMode } from '@/types/settings';
import { Input } from '@/components/ui/Input';

interface AIPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string, mode?: ChatInputMode) => void;
  onExplainTerm: () => void;
  onRetryMessage: (messageId: string, mode?: ChatInputMode) => void;
  onStopGeneration: () => void;
  onPinToCanvas: (messageId: string, pageHint?: number) => void;
  onUnpinFromCanvas: (messageId: string) => void;
  onLocateCanvasCard: (messageId: string) => void;
  onSendToRightPane: (messageId: string, pageHint?: number) => void;
  onSummarize: () => void;
  onTranslateSelection: () => void;
  onExportNotes: () => void;
  onJumpToCitation: (page: number) => void;
  showPerfHints: boolean;
  defaultInputMode: ChatInputMode;
  pendingRouteConfirmation: {
    content: string;
    confidence: number;
    suggestedIntent: 'chat' | 'doc_qa' | 'term';
  } | null;
  onConfirmRouteAsChat: () => void;
  onConfirmRouteAsDoc: () => void;
  onDismissRouteConfirm: () => void;
  pinnedMessageIds: string[];
}

export function AIPanel({
  messages,
  isLoading,
  onSendMessage,
  onExplainTerm,
  onRetryMessage,
  onStopGeneration,
  onPinToCanvas,
  onUnpinFromCanvas,
  onLocateCanvasCard,
  onSendToRightPane,
  onSummarize,
  onTranslateSelection,
  onExportNotes,
  onJumpToCitation,
  showPerfHints,
  defaultInputMode,
  pendingRouteConfirmation,
  onConfirmRouteAsChat,
  onConfirmRouteAsDoc,
  onDismissRouteConfirm,
  pinnedMessageIds,
}: AIPanelProps) {
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<ChatInputMode>(defaultInputMode);
  useEffect(() => {
    setInputMode(defaultInputMode);
  }, [defaultInputMode]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const pinnedIdSet = new Set(pinnedMessageIds);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!shouldStickToBottomRef.current) return;

    container.scrollTo({
      top: container.scrollHeight,
      // Streaming updates happen frequently; smooth here causes scroll jitter.
      behavior: isLoading ? 'auto' : 'smooth',
    });
  }, [messages, isLoading]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ messageId?: string }>;
      const targetId = custom.detail?.messageId;
      if (!targetId) return;
      const targetEl = globalThis.document?.querySelector<HTMLElement>(`[data-ai-message-id="${targetId}"]`);
      if (!targetEl) return;
      setFocusedMessageId(targetId);
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      globalThis.setTimeout(() => setFocusedMessageId((prev) => (prev === targetId ? null : prev)), 1800);
    };
    globalThis.addEventListener('ai-open-message', handler as EventListener);
    return () => globalThis.removeEventListener('ai-open-message', handler as EventListener);
  }, []);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 72;
  };

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim(), inputMode);
      setInput('');
    }
  };

  const formatRouteHint = (message: Message) => {
    if (!message.routeIntent) return null;
    const label = message.routeIntent === 'doc_qa'
      ? 'doc'
      : message.routeIntent === 'term'
        ? 'term'
        : 'chat';
    const conf = typeof message.routeConfidence === 'number'
      ? ` ${(message.routeConfidence * 100).toFixed(0)}%`
      : '';
    return `route ${label}${conf}`;
  };

  const formatUsageHint = (message: Message) => {
    if (!showPerfHints) return null;
    const usage = message.usage;
    if (!usage) return null;
    const parts: string[] = [];
    if (typeof usage.totalTokens === 'number') {
      parts.push(`tokens ${usage.totalTokens}`);
    } else if (typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number') {
      parts.push(`tokens ${(usage.promptTokens || 0) + (usage.completionTokens || 0)}`);
    } else {
      parts.push('tokens n/a');
    }
    if (typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number') {
      parts.push(`in ${usage.promptTokens ?? '-'} / out ${usage.completionTokens ?? '-'}`);
    }
    if (typeof usage.latencyMs === 'number') {
      parts.push(`${(usage.latencyMs / 1000).toFixed(2)}s`);
    }
    if (typeof usage.ttftMs === 'number') {
      parts.push(`ttft ${(usage.ttftMs / 1000).toFixed(2)}s`);
    }
    if (usage.model) {
      parts.push(usage.model);
    }
    if (usage.cached) {
      parts.push('cache');
    }
    return parts.join(' · ');
  };

  const sessionStats = useMemo(
    () =>
      messages.reduce(
        (acc, m) => {
          if (m.role !== 'assistant' || !m.usage) return acc;
          if (typeof m.usage.promptTokens === 'number') acc.prompt += m.usage.promptTokens;
          if (typeof m.usage.completionTokens === 'number') acc.completion += m.usage.completionTokens;
          if (typeof m.usage.totalTokens === 'number') acc.total += m.usage.totalTokens;
          else if (typeof m.usage.promptTokens === 'number' || typeof m.usage.completionTokens === 'number') {
            acc.total += (m.usage.promptTokens || 0) + (m.usage.completionTokens || 0);
          }
          if (typeof m.usage.latencyMs === 'number') {
            acc.latencySum += m.usage.latencyMs;
            acc.latencyCount += 1;
          }
          return acc;
        },
        { prompt: 0, completion: 0, total: 0, latencySum: 0, latencyCount: 0 }
      ),
    [messages]
  );
  const avgLatency = sessionStats.latencyCount > 0
    ? `${(sessionStats.latencySum / sessionStats.latencyCount / 1000).toFixed(2)}s`
    : '--';

  const renderAssistantContent = (content: string) => {
    const markdownWithCitationLinks = content.replace(
      /(\[ref:p(\d+)\]|\[p(\d+)\])/gi,
      (_raw, label: string, p1: string, p2: string) => {
        const page = Number(p1 || p2 || '0');
        if (!page || !Number.isFinite(page)) return label;
        return `[${label}](cite://page/${page})`;
      }
    );

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('cite://page/')) {
              const page = Number(href.split('/').pop() || '0');
              return (
                <button
                  className="mx-0.5 inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 hover:bg-sky-100"
                  onClick={() => page > 0 && onJumpToCitation(page)}
                  title={page > 0 ? `Jump to page ${page}` : 'Citation'}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                {children}
              </a>
            );
          },
          pre: ({ children }) => <pre className="ai-md-pre">{children}</pre>,
          code: ({ children, className }) => (
            <code className={`ai-md-code ${className || ''}`.trim()}>{children}</code>
          ),
          table: ({ children }) => <table className="ai-md-table">{children}</table>,
        }}
      >
        {markdownWithCitationLinks}
      </ReactMarkdown>
    );
  };

  const copyMessage = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedMessageId(msg.id || null);
      setTimeout(() => setCopiedMessageId(null), 1200);
    } catch {
      // ignore
    }
  }, []);

  const extractFirstCitationPage = (content: string): number | undefined => {
    const match = content.match(/\[ref:p(\d+)\]|\[p(\d+)\]/i);
    if (!match) return undefined;
    const page = Number(match[1] || match[2] || '0');
    return Number.isFinite(page) && page > 0 ? page : undefined;
  };

  const handleDragAICard = (event: DragEvent<HTMLElement>, msg: Message) => {
    if (!msg.id || !msg.content?.trim()) return;
    const payload = {
      messageId: msg.id,
      content: msg.content,
      pageHint: extractFirstCitationPage(msg.content),
    };
    const json = JSON.stringify(payload);
    event.dataTransfer.setData('application/x-ai-card', json);
    event.dataTransfer.setData('text/plain', `__AICARD__${json}`);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-[380px] border-l border-[#E3E8F0]/60 bg-gradient-to-b from-[#FCFDFF] to-[#F8FAFC] flex flex-col select-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#E3E8F0]/60">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#E42313] to-[#B91C1C] shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V12h3l3 3-3 3h-3v1a4 4 0 1 1-8 0v-1H3l-3-3 3-3h3V9.4A4 4 0 0 1 12 2z"/></svg>
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#111827] leading-tight">AI Assistant</h2>
            <p className="text-[10px] text-[#94A3B8] leading-none mt-0.5">Context-aware help</p>
          </div>
        </div>
        {showPerfHints && sessionStats.total > 0 && (
          <div
            className="mt-2.5 inline-flex rounded-full border border-[#E5EAF3] bg-white/80 px-2.5 py-0.5 text-[10px] tabular-nums text-[#64748B]"
            title={`Prompt: ${sessionStats.prompt} | Completion: ${sessionStats.completion} | Avg latency: ${avgLatency}`}
          >
            {sessionStats.total} tokens · avg {avgLatency}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button type="button" className="quick-action-chip" onClick={onSummarize} title="Summarize the current document">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            Summarize Doc
          </button>
          <button type="button" className="quick-action-chip" onClick={onExplainTerm} title="Select text in the PDF first, then click to explain">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Explain ✦
          </button>
          <button type="button" className="quick-action-chip" onClick={onTranslateSelection} title="Select text in the PDF first, then click to translate to Chinese">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
            Translate ✦
          </button>
          <button type="button" className="quick-action-chip" onClick={onExportNotes} title="Export all highlights and notes as Markdown">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-[#CBD5E1]">✦ = select text in PDF first</p>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] flex items-center justify-center mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="text-[13px] text-[#94A3B8] font-medium">Ask about your document</p>
            <p className="text-[11px] text-[#CBD5E1] mt-1">Or try the quick actions above</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              data-ai-message-id={msg.id || ''}
              className={`ai-msg-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`ai-msg group max-w-[85%] p-3 text-sm rounded-2xl leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#E42313] text-white rounded-br-md'
                  : msg.status === 'error'
                    ? 'bg-rose-50 border border-rose-200 text-rose-700 rounded-bl-md'
                    : 'bg-white border border-[#E5EAF3] text-[#111827] rounded-bl-md'
              } ${focusedMessageId && msg.id === focusedMessageId ? 'ai-msg-focus-ring' : ''}`}>
                {msg.status === 'thinking' ? (
                  <div className="inline-flex items-center gap-2 text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="inline-flex items-center gap-1">
                      Thinking
                      <span className="ai-dot" />
                      <span className="ai-dot ai-dot-delay-1" />
                      <span className="ai-dot ai-dot-delay-2" />
                    </span>
                  </div>
                ) : (
                  <>
                    {msg.role === 'assistant' ? (
                      <div>
                        {renderAssistantContent(msg.content)}
                        {msg.status === 'streaming' && <span className="ai-stream-caret">|</span>}
                      </div>
                    ) : msg.content}
                    {msg.role === 'assistant' && (
                      <div className="mt-2 text-[11px] text-gray-500">
                        {[
                          formatRouteHint(msg),
                          pinnedIdSet.has(msg.id || '') ? 'pinned' : null,
                          formatUsageHint(msg),
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {msg.role === 'assistant' && (
                      <div className="ai-msg-toolbar mt-2 flex max-w-full flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="ai-msg-action"
                          onClick={() => void copyMessage(msg)}
                          disabled={isLoading}
                          title={copiedMessageId === msg.id ? 'Copied' : 'Copy response'}
                        >
                          {copiedMessageId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedMessageId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        {msg.id && (
                          <div
                            role="button"
                            tabIndex={0}
                            draggable={!isLoading}
                            onDragStart={(e) => handleDragAICard(e, msg)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
                            className="ai-msg-action cursor-grab active:cursor-grabbing"
                            title="Drag to PDF canvas"
                          >
                            <GripVertical size={13} />
                            <span>Drag</span>
                          </div>
                        )}
                        {msg.id && (
                          <button
                            type="button"
                            className="ai-msg-action"
                            onClick={() =>
                              pinnedIdSet.has(msg.id || '')
                                ? onUnpinFromCanvas(msg.id!)
                                : onPinToCanvas(msg.id!, extractFirstCitationPage(msg.content))
                            }
                            disabled={isLoading}
                            title={pinnedIdSet.has(msg.id || '') ? 'Remove AI card from canvas' : 'Pin as canvas card'}
                          >
                            <Pin size={13} />
                            <span>{pinnedIdSet.has(msg.id || '') ? 'Unpin' : 'Pin'}</span>
                          </button>
                        )}
                        {msg.id && (
                          <button
                            type="button"
                            className="ai-msg-action"
                            onClick={() => onSendToRightPane(msg.id!, extractFirstCitationPage(msg.content))}
                            disabled={isLoading}
                            title="Open cited page in reference pane for verification"
                          >
                            <MapPin size={13} />
                            <span>Verify</span>
                          </button>
                        )}
                        {msg.id && (
                          <button
                            type="button"
                            className="ai-msg-action"
                            onClick={() => onLocateCanvasCard(msg.id!)}
                            disabled={isLoading}
                            title="Locate card in canvas"
                          >
                            <MapPin size={13} />
                            <span>Locate</span>
                          </button>
                        )}
                        {msg.status === 'error' && msg.id && (
                          <button
                            type="button"
                            className="ai-msg-action"
                            onClick={() => onRetryMessage(msg.id!)}
                            disabled={isLoading}
                            title="Retry with current route"
                          >
                            <RotateCcw size={13} />
                            <span>Retry</span>
                          </button>
                        )}
                        {msg.status === 'error' && (
                          <span className="text-[10px] text-slate-400">
                            Need route switch? Use input mode (Auto/Chat/Doc) then resend.
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 py-3 border-t border-[#E3E8F0]/60 bg-white/60 backdrop-blur-lg">
        {pendingRouteConfirmation && !isLoading && (
          <div className="mb-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-[11px] text-amber-800">
            <div className="flex items-start justify-between gap-2">
              <p className="leading-relaxed">
                Low confidence ({Math.round(pendingRouteConfirmation.confidence * 100)}%) — choose how to answer:
              </p>
              <button type="button" className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors" onClick={onDismissRouteConfirm}>✕</button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button type="button" className="quick-action-chip" onClick={onConfirmRouteAsChat}>Chat</button>
              <button type="button" className="quick-action-chip" onClick={onConfirmRouteAsDoc}>Document</button>
            </div>
          </div>
        )}
        {isLoading && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#F1F5F9] px-3 py-1.5 text-[11px] text-[#475569]">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Generating…
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[#D9DEE8] bg-white px-2 py-0.5 text-[10px] font-medium text-[#475569] hover:bg-[#F8FAFC] transition-colors active:scale-95"
              onClick={onStopGeneration}
            >
              <Square size={9} />
              Stop
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {/* Mode selector */}
          <div className="flex items-center rounded-lg border border-[#E3E8F0] bg-[#F8FAFC] p-0.5">
            {(['auto', 'chat', 'doc'] as ChatInputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-all duration-100 ${
                  inputMode === mode
                    ? 'bg-[#E42313] text-white shadow-sm'
                    : 'text-[#64748B] hover:text-[#334155]'
                }`}
                onClick={() => setInputMode(mode)}
                disabled={isLoading}
              >
                {mode}
              </button>
            ))}
          </div>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="!h-9 !rounded-lg !text-[13px]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E42313] text-white shadow-sm transition-all duration-150 hover:bg-[#c71e10] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.93]"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
