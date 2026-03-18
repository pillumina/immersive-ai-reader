import { useState, useRef, useEffect } from 'react';
import { Check, Copy, Loader2, Pin, RotateCcw, Square, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/conversation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface AIPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onRetryMessage: (messageId: string) => void;
  onStopGeneration: () => void;
  onPinToCanvas: (messageId: string) => void;
  onSummarize: () => void;
  onTranslateSelection: () => void;
  onExportNotes: () => void;
  onJumpToCitation: (page: number) => void;
}

export function AIPanel({
  messages,
  isLoading,
  onSendMessage,
  onRetryMessage,
  onStopGeneration,
  onPinToCanvas,
  onSummarize,
  onTranslateSelection,
  onExportNotes,
  onJumpToCitation,
}: AIPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 72;
  };

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const formatUsageHint = (message: Message) => {
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
    if (usage.model) {
      parts.push(usage.model);
    }
    return parts.join(' · ');
  };

  const sessionStats = messages.reduce(
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

  const copyMessage = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedMessageId(msg.id || null);
      setTimeout(() => setCopiedMessageId(null), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <aside className="w-[400px] border-l border-[#E3E8F0] bg-[#FCFDFF] flex flex-col">
      <div className="p-4 border-b border-[#E3E8F0]">
        <h2 className="text-lg font-semibold text-[#111827]">AI Assistant</h2>
        <p className="text-xs text-[#6B7280] mt-1">Context-aware help for current document</p>
        <div
          className="mt-2 inline-flex rounded-full border border-[#E5EAF3] bg-white px-3 py-1 text-[11px] text-[#4B5563]"
          title={`Prompt: ${sessionStats.prompt} | Completion: ${sessionStats.completion} | Avg latency: ${avgLatency}`}
        >
          Session tokens {sessionStats.total} · avg {avgLatency}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onSummarize}>Summarize</Button>
          <Button variant="secondary" size="sm" onClick={onTranslateSelection}>Translate Selection</Button>
          <Button variant="secondary" size="sm" onClick={onExportNotes}>Export Notes</Button>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 ? (
          <p className="text-gray-400 text-sm text-center pt-8">
            Ask questions about your document
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`ai-msg-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`ai-msg group max-w-[85%] p-3 text-sm rounded-2xl leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#E42313] text-white rounded-br-md'
                  : msg.status === 'error'
                    ? 'bg-rose-50 border border-rose-200 text-rose-700 rounded-bl-md'
                    : 'bg-white border border-[#E5EAF3] text-[#111827] rounded-bl-md'
              }`}>
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
                        {formatUsageHint(msg)}
                      </div>
                    )}
                    {msg.role === 'assistant' && (
                      <div className="ai-msg-toolbar mt-2 flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void copyMessage(msg)}
                          disabled={isLoading}
                        >
                          {copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                        </Button>
                        {msg.id && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onPinToCanvas(msg.id!)}
                            disabled={isLoading}
                          >
                            <Pin size={14} />
                            Pin
                          </Button>
                        )}
                        {msg.status === 'error' && msg.id && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onRetryMessage(msg.id!)}
                            disabled={isLoading}
                          >
                            <RotateCcw size={14} />
                            Retry
                          </Button>
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

      <div className="p-4 border-t border-[#E3E8F0]">
        {isLoading && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Model is generating response...
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
              onClick={onStopGeneration}
            >
              <Square size={10} />
              Stop
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question..."
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={20} />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
