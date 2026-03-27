import { Check, Copy, GripVertical, Pin, RotateCcw, Search, BadgeCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/conversation';
import { aiCardDragState } from './AIPanel';
import { splitCompleteMarkdownBlocks } from '@/utils/markdownStream';
import type { DragEvent, PointerEvent } from 'react';
import { memo, useRef, useEffect } from 'react';

interface ChatMessageProps {
  msg: Message;
  isLastInGroup: boolean;
  isLoading: boolean;
  pinnedIdSet: Set<string>;
  focusedMessageId: string | null;
  copiedMessageId: string | null;
  onCopy: (msg: Message) => void;
  onPin: (messageId: string, pageHint?: number) => void;
  onUnpin: (messageId: string) => void;
  onLocate: (messageId: string) => void;
  onSendToRight: (messageId: string, pageHint?: number) => void;
  onRetry: (messageId: string) => void;
  onJumpToCitation: (page: number) => void;
}

function formatTime(msg: Message): string | null {
  if (!msg.timestamp) return null;
  const d = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
  if (isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function extractFirstCitationPage(content: string): number | undefined {
  // Priority order: explicit brackets first, then natural language
  const patterns = [
    // [ref:pN] or [pN] — explicit format (highest priority)
    /\[ref:p(\d+)\]/i,
    /\[p(\d+)\]/i,
    // page N / pages N (with optional comma/colon/space)
    /(?:page|pages|p\.?|pp\.?)\s*:?\s*(\d+)/i,
    // 第N页 / 第N页 / 见第N页
    /(?:第|见第|在第)\s*(\d+)\s*页/,
  ];

  for (const regex of patterns) {
    const match = content.match(regex);
    if (match) {
      const page = Number(match[1] || '0');
      if (Number.isFinite(page) && page > 0) return page;
    }
  }
  return undefined;
}

function renderAssistantContent(content: string, isStreaming: boolean, onJumpToCitation: (page: number) => void) {
  let markdownToRender: string;
  let rawTail: string | null = null;

  if (isStreaming && content) {
    const { rendered, tail } = splitCompleteMarkdownBlocks(content);
    markdownToRender = rendered;
    rawTail = tail.trim() ? tail.trim() : null;
  } else {
    markdownToRender = content;
  }

  const markdownWithCitationLinks = markdownToRender.replace(
    /(\[ref:p(\d+)\]|\[p(\d+)\])/gi,
    (_raw, label: string, p1: string, p2: string) => {
      const page = Number(p1 || p2 || '0');
      if (!page || !Number.isFinite(page)) return label;
      return `[${label}](cite://page/${page})`;
    }
  );

  return (
    <>
      {markdownWithCitationLinks && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('cite://page/')) {
                const page = Number(href.split('/').pop() || '0');
                return (
                  <button
                    className="mx-0.5 inline-flex items-center rounded-md border border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-border)]"
                    onClick={() => page > 0 && onJumpToCitation(page)}
                    title={page > 0 ? `Jump to page ${page}` : 'Citation'}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-[var(--color-accent-text)] underline">
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
      )}
      {rawTail && (
        <span className="ai-raw-tail whitespace-pre-wrap">{rawTail}</span>
      )}
    </>
  );
}

function formatRouteHint(msg: Message): string | null {
  if (!msg.routeIntent) return null;
  const label = msg.routeIntent === 'doc_qa'
    ? 'doc'
    : msg.routeIntent === 'term'
      ? 'term'
      : 'chat';
  const conf = typeof msg.routeConfidence === 'number'
    ? ` ${(msg.routeConfidence * 100).toFixed(0)}%`
    : '';
  return `route ${label}${conf}`;
}

export const ChatMessage = memo(function ChatMessageWip({
  msg,
  isLastInGroup,
  isLoading,
  pinnedIdSet,
  focusedMessageId,
  copiedMessageId,
  onCopy,
  onPin,
  onUnpin,
  onLocate,
  onSendToRight,
  onRetry,
  onJumpToCitation,
}: ChatMessageProps) {
  const timeStr = formatTime(msg);

  // Clean up drag pointer listeners if component unmounts mid-drag.
  const dragListenersRef = useRef<{
    move: ((e: PointerEvent) => void) | null;
    up: ((e: PointerEvent) => void) | null;
  }>({ move: null, up: null });

  useEffect(() => {
    return () => {
      if (dragListenersRef.current.move) {
        globalThis.document?.removeEventListener('pointermove', dragListenersRef.current.move as unknown as EventListener);
      }
      if (dragListenersRef.current.up) {
        globalThis.document?.removeEventListener('pointerup', dragListenersRef.current.up as unknown as EventListener);
      }
    };
  }, []);

  const bubbleClass = msg.role === 'user'
    ? 'bg-[var(--color-accent)] text-white rounded-br-md'
    : msg.status === 'error'
      ? 'bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] rounded-bl-md'
      : 'bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-[var(--color-text)] rounded-bl-md';

  return (
    <div
      data-ai-message-id={msg.id || ''}
      className={`ai-msg-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
      style={!isLastInGroup ? { marginTop: '-4px' } : undefined}
    >
      <div
        className={`ai-msg group relative max-w-[85%] p-3 text-[13px] leading-relaxed shadow-sm transition-shadow duration-200 select-text ${bubbleClass} ${
          focusedMessageId && msg.id === focusedMessageId ? 'ai-msg-focus-ring' : ''
        }`}
        style={{ contain: 'layout' }}
      >
        {/* Timestamp — appears on hover */}
        {timeStr && <span className="ai-msg-time">{timeStr}</span>}

        {msg.status === 'thinking' ? (
          <div className="inline-flex items-center gap-2 text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="ai-dot" />
              <span className="ai-dot ai-dot-delay-1" />
              <span className="ai-dot ai-dot-delay-2" />
            </span>
            <span className="text-[12px]">Typing</span>
          </div>
        ) : (
          <>
            {msg.role === 'assistant' ? (
              <div>
                {renderAssistantContent(msg.content, msg.status === 'streaming', onJumpToCitation)}
                {msg.status === 'streaming' && <span className="ai-stream-caret">|</span>}
              </div>
            ) : (
              msg.content
            )}

            {msg.role === 'assistant' && (
              <div className="mt-2 text-[11px] text-gray-500">
                {[
                  formatRouteHint(msg),
                  pinnedIdSet.has(msg.id || '') ? 'pinned' : null,
                ].filter(Boolean).join(' · ')}
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="ai-msg-toolbar mt-2.5 flex max-w-full flex-wrap items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                <button
                  type="button"
                  className="ai-msg-action"
                  onClick={() => onCopy(msg)}
                  disabled={isLoading}
                  title={copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                >
                  {copiedMessageId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                </button>

                {msg.id && (
                  <div
                    draggable
                    className="ai-msg-action"
                    style={{ cursor: 'grab' }}
                    title="Drag to canvas"
                    onDragStart={(e: DragEvent<HTMLElement>) => {
                      const payload = {
                        type: 'ai' as const,
                        messageId: msg.id!,
                        content: msg.content,
                        pageHint: extractFirstCitationPage(msg.content),
                      };
                      aiCardDragState.payload = payload;
                      aiCardDragState.isDragging = true;
                      try {
                        e.dataTransfer.setData('application/x-ai-card', JSON.stringify(payload));
                        e.dataTransfer.effectAllowed = 'copy';
                      } catch { /* Tauri WebView: dataTransfer unavailable */ }
                    }}
                    onPointerDown={(e: PointerEvent<HTMLElement>) => {
                      if (e.button !== 0) return;
                      aiCardDragState.payload = {
                        type: 'ai' as const,
                        messageId: msg.id!,
                        content: msg.content,
                        pageHint: extractFirstCitationPage(msg.content),
                      };
                      aiCardDragState.isDragging = true;

                      const onPointerMove = () => {};
                      const onPointerUp = (ev: PointerEvent) => {
                        if (dragListenersRef.current.move) {
                          globalThis.document?.removeEventListener('pointermove', dragListenersRef.current.move as unknown as EventListener);
                          dragListenersRef.current.move = null;
                        }
                        if (dragListenersRef.current.up) {
                          globalThis.document?.removeEventListener('pointerup', dragListenersRef.current.up as unknown as EventListener);
                          dragListenersRef.current.up = null;
                        }
                        if (!aiCardDragState.payload) return;
                        const scrollEl = globalThis.document?.getElementById('pdf-scroll-container');
                        if (scrollEl) {
                          const rect = scrollEl.getBoundingClientRect();
                          const { clientX: cx, clientY: cy } = ev;
                          if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                            scrollEl.dispatchEvent(new CustomEvent('ai-card-drop', {
                              detail: { payload: aiCardDragState.payload, clientX: cx, clientY: cy },
                              bubbles: true,
                            }));
                          }
                        }
                        aiCardDragState.payload = null;
                        aiCardDragState.isDragging = false;
                      };
                      globalThis.document?.addEventListener('pointermove', onPointerMove as unknown as EventListener);
                      globalThis.document?.addEventListener('pointerup', onPointerUp as unknown as EventListener);
                      dragListenersRef.current.move = onPointerMove;
                      dragListenersRef.current.up = onPointerUp;
                    }}
                  >
                    <GripVertical size={13} />
                  </div>
                )}

                {msg.id && (
                  <button
                    type="button"
                    className="ai-msg-action"
                    onClick={() =>
                      pinnedIdSet.has(msg.id || '')
                        ? onUnpin(msg.id!)
                        : onPin(msg.id!, extractFirstCitationPage(msg.content))
                    }
                    disabled={isLoading}
                    title={pinnedIdSet.has(msg.id || '') ? 'Unpin from canvas' : 'Pin to canvas'}
                  >
                    <Pin size={13} />
                  </button>
                )}

                {msg.id && (
                  <button
                    type="button"
                    className="ai-msg-action"
                    onClick={() => onLocate(msg.id!)}
                    disabled={isLoading}
                    title="Find in canvas"
                  >
                    <Search size={13} />
                  </button>
                )}

                {msg.id && (
                  <button
                    type="button"
                    className="ai-msg-action"
                    onClick={() => onSendToRight(msg.id!, extractFirstCitationPage(msg.content))}
                    disabled={isLoading}
                    title="Verify cited page"
                  >
                    <BadgeCheck size={13} />
                  </button>
                )}

                {msg.status === 'error' && msg.id && (
                  <button
                    type="button"
                    className="ai-msg-action ai-msg-action--danger"
                    onClick={() => onRetry(msg.id!)}
                    disabled={isLoading}
                    title="Retry"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
