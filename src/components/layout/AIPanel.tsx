/**
 * Module-level drag state — used for cross-component drag-and-drop.
 * Tauri WebView doesn't reliably fire dragover/drop events, so we use
 * pointer events with document-level listeners instead.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const aiCardDragState = {
  payload: null as
    | { type: 'ai'; messageId: string; content: string; pageHint?: number }
    | { type: 'note'; content: string; page?: number }
    | null,
  isDragging: false,
};
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Square, Send, MessageSquare, StickyNote } from 'lucide-react';
import { Message } from '@/types/conversation';
import { Logo } from '@/components/ui/Logo';
import { ChatInputMode } from '@/types/settings';
import { Input } from '@/components/ui/Input';
import { NotesManager } from '@/components/features/NotesManager';
import { ChatMessage } from './ChatMessage';

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
  // Notes Manager (inline in panel)
  notesAnnotations: Array<{ id: string; page_number: number; text: string; created_at: string }>;
  onDeleteNote: (annotationId: string) => Promise<void>;
  onUpdateNote: (annotationId: string, newContent: string) => Promise<void>;
  onJumpToPage: (page: number) => void;
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
  // Attachments
  attachments: Array<{ id: string; type: 'text' | 'note'; content: string; page?: number }>;
  onAddAttachment: (attachment: { type: 'text' | 'note'; content: string; page?: number }) => void;
  onRemoveAttachment: (id: string) => void;
  // Panel resize & collapse
  width?: number;
  isCollapsed?: boolean;
  onWidthChange?: (width: number) => void;
  onCollapse?: (collapsed: boolean) => void;
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
  notesAnnotations,
  onDeleteNote,
  onUpdateNote,
  onJumpToPage,
  showPerfHints,
  defaultInputMode,
  pendingRouteConfirmation,
  onConfirmRouteAsChat,
  onConfirmRouteAsDoc,
  onDismissRouteConfirm,
  pinnedMessageIds,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  width = 380,
  isCollapsed = false,
  onCollapse,
  onWidthChange,
}: AIPanelProps) {
  const [notesView, setNotesView] = useState(false);
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<ChatInputMode>(defaultInputMode);
  const [hasSelection, setHasSelection] = useState(false);
  const [isDragOverPanel, setIsDragOverPanel] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(width);

  useEffect(() => {
    setInputMode(defaultInputMode);
  }, [defaultInputMode]);

  // Track whether text is selected in the PDF for quick-action chip state.
  useEffect(() => {
    const checkSelection = () => {
      const sel = globalThis.getSelection?.();
      setHasSelection(!!(sel && !sel.isCollapsed && sel.toString().trim().length > 0));
    };
    globalThis.addEventListener('mouseup', checkSelection);
    return () => globalThis.removeEventListener('mouseup', checkSelection);
  }, []);

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

  // Listen for text/note attachments dropped from canvas
  useEffect(() => {
    const onTextDrop = (e: Event) => {
      const ce = e as CustomEvent<{ content: string; page?: number }>;
      onAddAttachment({ type: 'text', content: ce.detail.content, page: ce.detail.page });
    };
    const onNoteDrop = (e: Event) => {
      const ce = e as CustomEvent<{ content: string; page?: number }>;
      onAddAttachment({ type: 'note', content: ce.detail.content, page: ce.detail.page });
    };
    globalThis.document?.addEventListener('text-attachment-drop', onTextDrop);
    globalThis.document?.addEventListener('note-attachment-drop', onNoteDrop);
    return () => {
      globalThis.document?.removeEventListener('text-attachment-drop', onTextDrop);
      globalThis.document?.removeEventListener('note-attachment-drop', onNoteDrop);
    };
  }, [onAddAttachment]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 72;
  };

  const buildAttachmentContext = (attachments: AIPanelProps['attachments']) => {
    if (attachments.length === 0) return '';
    const blocks = attachments.map((a) => {
      const source = a.page ? `Page ${a.page}` : 'Unknown page';
      const label = a.type === 'text' ? 'Selected Text' : 'Note';
      const preview = a.content.length > 200 ? a.content.slice(0, 200) + '…' : a.content;
      return `[${label} (${source})]\n"${preview}"`;
    });
    return `=== Attachments ===\n${blocks.join('\n\n')}\n=== End Attachments ===\n\n`;
  };

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      const contextPrefix = buildAttachmentContext(attachments);
      onSendMessage(contextPrefix + input.trim(), inputMode);
      setInput('');
      // Clear attachments after sending
      attachments.forEach((a) => onRemoveAttachment(a.id));
    }
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

  const copyMessage = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedMessageId(msg.id || null);
      setTimeout(() => setCopiedMessageId(null), 1200);
    } catch {
      // ignore
    }
  }, []);

  // Store the message being dragged in a ref so the canvas can read it on drop.
  return (
    <>
      {/* Collapsed Strip */}
      {isCollapsed ? (
        <div className="w-[48px] border-l border-[#e7e5e4]/60 bg-gradient-to-b from-[#fafaf9] to-[#fafaf9] flex flex-col items-center py-4 gap-3">
          <button
            type="button"
            onClick={() => onCollapse?.(false)}
            className="w-9 h-9 rounded-xl bg-[#c2410c] text-white flex items-center justify-center shadow-sm hover:bg-[#9a3412] transition-colors"
            title="Expand AI Panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onSummarize}
              className="w-9 h-9 rounded-lg bg-white border border-[#e7e5e4] flex items-center justify-center text-[#78716c] hover:bg-[#fff7ed] hover:border-[#fed7aa] hover:text-[#c2410c] transition-colors"
              title="Summarize"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button
              type="button"
              onClick={onExportNotes}
              className="w-9 h-9 rounded-lg bg-white border border-[#e7e5e4] flex items-center justify-center text-[#78716c] hover:bg-[#fff7ed] hover:border-[#fed7aa] hover:text-[#c2410c] transition-colors"
              title="Export Notes"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </div>
        </div>
      ) : (
      <aside
        className={`relative border-l border-[#e7e5e4]/60 bg-gradient-to-b from-[#fafaf9] to-[#fafaf9] flex flex-col select-none ${isDragOverPanel ? 'ring-2 ring-[#c2410c] ring-inset bg-[#fff7ed]/30' : ''}`}
        style={{ width }}
        onPointerEnter={() => setIsDragOverPanel(true)}
        onPointerLeave={() => setIsDragOverPanel(false)}
      >
        {/* Collapse Button */}
        <button
          type="button"
          onClick={() => onCollapse?.(true)}
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-30 w-6 h-6 rounded-full bg-white border border-[#e7e5e4] shadow-sm flex items-center justify-center text-[#78716c] hover:text-[#c2410c] hover:border-[#fed7aa] transition-colors"
          title="Collapse AI Panel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

      {/* Resize Handle */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 group-hover:bg-[#c2410c]/30 transition-colors ${isResizing ? 'bg-[#c2410c]/50' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
          resizeStartXRef.current = e.clientX;
          resizeStartWidthRef.current = width;

          const onPointerMove = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientX - resizeStartXRef.current;
            const newWidth = Math.min(Math.max(resizeStartWidthRef.current + delta, 280), 600);
            onWidthChange?.(newWidth);
          };

          const onPointerUp = () => {
            setIsResizing(false);
            globalThis.document?.removeEventListener('pointermove', onPointerMove as unknown as EventListener);
            globalThis.document?.removeEventListener('pointerup', onPointerUp);
          };

          globalThis.document?.addEventListener('pointermove', onPointerMove as unknown as EventListener);
          globalThis.document?.addEventListener('pointerup', onPointerUp);
        }}
      />

      {/* Tab Bar */}
      <div className="flex items-center border-b border-[#e7e5e4]/60 px-1">
        <button
          type="button"
          onClick={() => setNotesView(false)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
            !notesView
              ? 'border-[#c2410c] text-[#c2410c]'
              : 'border-transparent text-[#a8a29e] hover:text-[#78716c]'
          }`}
        >
          <MessageSquare size={13} />
          Chat
        </button>
        <button
          type="button"
          onClick={() => setNotesView(true)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
            notesView
              ? 'border-[#c2410c] text-[#c2410c]'
              : 'border-transparent text-[#a8a29e] hover:text-[#78716c]'
          }`}
          title="Note Management"
        >
          <StickyNote size={13} />
          Notes
        </button>
      </div>

      {/* Content: Chat or Notes Manager */}
      {notesView ? (
        <NotesManager
          annotations={notesAnnotations}
          onJumpToPage={onJumpToPage}
          onDeleteNote={onDeleteNote}
          onUpdateNote={onUpdateNote}
        />
      ) : (
        <>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[#e7e5e4]/60">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#c2410c] to-[#9a3412] flex items-center justify-center shrink-0 shadow-sm">
              <Logo size={14} variant="dark" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#1c1917] leading-tight">AI Assistant</h2>
              {showPerfHints && sessionStats.total > 0 && (
                <span
                  className="inline-flex rounded-full border border-[#e7e5e4] bg-white/80 px-2 py-0.5 text-[10px] tabular-nums text-[#78716c]"
                  title={`Prompt: ${sessionStats.prompt} | Completion: ${sessionStats.completion} | Avg latency: ${avgLatency}`}
                >
                  {sessionStats.total} tokens · avg {avgLatency}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="quick-action-chip" onClick={onSummarize} title="Summarize the current document">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              Summarize
            </button>
            <button type="button" className={`quick-action-chip${hasSelection ? '' : ' quick-action-chip--disabled'}`} onClick={onExplainTerm} title={hasSelection ? 'Explain the selected term' : 'Select text in the PDF first'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Explain
            </button>
            <button type="button" className={`quick-action-chip${hasSelection ? '' : ' quick-action-chip--disabled'}`} onClick={onTranslateSelection} title={hasSelection ? 'Translate the selected text' : 'Select text in the PDF first'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
              Translate
            </button>
            <button type="button" className="quick-action-chip" onClick={onExportNotes} title="Export all highlights and notes as Markdown">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          </div>
        </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fafaf9] to-[#e7e5e4] flex items-center justify-center mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="text-[13px] text-[#a8a29e] font-medium mb-4">Ask about your document</p>
            <div className="flex flex-col gap-2 w-full">
              {[
                'What is this document about?',
                'Summarize the main points',
                'Explain the key concepts',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    const inputEl = globalThis.document?.querySelector<HTMLTextAreaElement>('#ai-chat-input');
                    if (inputEl) {
                      inputEl.value = q;
                      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                      inputEl.focus();
                    }
                  }}
                  className="text-left text-[12px] px-3 py-2 rounded-xl border border-[#e7e5e4] bg-[#fafaf9] text-[#78716c] hover:border-[#c2410c]/40 hover:text-[#9a3412] hover:bg-[#fff7ed] transition-colors duration-150"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const isLastInGroup = !prev || prev.role !== msg.role;
              return (
                <ChatMessage
                  key={msg.id || idx}
                  msg={msg}
                  isLastInGroup={isLastInGroup}
                  isLoading={isLoading}
                  pinnedIdSet={pinnedIdSet}
                  focusedMessageId={focusedMessageId}
                  copiedMessageId={copiedMessageId}
                  onCopy={copyMessage}
                  onPin={onPinToCanvas}
                  onUnpin={onUnpinFromCanvas}
                  onLocate={onLocateCanvasCard}
                  onSendToRight={onSendToRightPane}
                  onRetry={onRetryMessage}
                  onJumpToCitation={onJumpToCitation}
                />
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 py-3 border-t border-[#e7e5e4]/60 bg-white/60 backdrop-blur-lg">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] border border-[#fed7aa] px-2 py-1 text-[11px] text-[#9a3412] max-w-[220px] group"
              >
                <span className="shrink-0 font-medium text-[10px]">
                  {a.type === 'text' ? '📝' : '📌'}{a.page ? ` P.${a.page}` : ''}
                </span>
                <span className="truncate flex-1">{a.content.slice(0, 60)}{a.content.length > 60 ? '…' : ''}</span>
                <button
                  type="button"
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-[#c2410c] hover:bg-[#fed7aa] transition-colors opacity-0 group-hover:opacity-100"
                  onClick={() => onRemoveAttachment(a.id)}
                  title="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#fafaf9] px-3 py-1.5 text-[11px] text-[#78716c]">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Generating…
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[#e7e5e4] bg-white px-2 py-0.5 text-[10px] font-medium text-[#78716c] hover:bg-[#fafaf9] transition-colors active:scale-95"
              onClick={onStopGeneration}
            >
              <Square size={9} />
              Stop
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {/* Mode selector */}
          <div className="flex items-center rounded-lg border border-[#e7e5e4] bg-[#fafaf9] p-0.5">
            {(['auto', 'chat', 'doc'] as ChatInputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-all duration-100 ${
                  inputMode === mode
                    ? 'bg-[#c2410c] text-white shadow-sm'
                    : 'text-[#78716c] hover:text-[#78716c]'
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c2410c] text-white shadow-sm transition-all duration-150 hover:bg-[#9a3412] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.93]"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
        </>
      )}
      </aside>
      )}
    </>
  );
}
