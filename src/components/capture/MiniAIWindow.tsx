import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/types/conversation';
import { simpleMarkdownToHtml } from '@/utils/markdown';

interface MiniAIWindowProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  onToggleMiniAI: () => void;
  /** Duration since session started (seconds) */
  sessionDurationSecs?: number;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const html = isUser ? null : simpleMarkdownToHtml(message.content);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-[#f5f5f4] text-[#1c1917] rounded-bl-sm'
        } ${isStreaming ? 'animate-pulse' : ''}`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : (
          <div
            className="prose prose-xs prose-stone"
            dangerouslySetInnerHTML={{ __html: html || '' }}
          />
        )}
      </div>
    </div>
  );
}

export function MiniAIWindow({
  messages,
  isLoading,
  onSendMessage,
  onStopGeneration,
  onToggleMiniAI,
  sessionDurationSecs = 0,
}: MiniAIWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInput('');
    setAutoScroll(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 z-[9000] flex flex-col w-80 bg-white border-l border-[#e7e5e4]/60 shadow-[-4px_0_24px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f5f5f4] bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-medium text-[#78716c]">Focus AI</span>
        </div>
        <div className="flex items-center gap-2">
          {sessionDurationSecs > 0 && (
            <span className="text-[10px] font-mono text-[#a8a29e] tabular-nums">
              {formatDuration(sessionDurationSecs)}
            </span>
          )}
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-md text-[#a8a29e] hover:bg-[#f5f5f4] hover:text-[#78716c] transition-colors"
            onClick={onToggleMiniAI}
            title="关闭 mini AI (Cmd+`)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAutoScroll(atBottom);
        }}
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="text-2xl mb-2">🤖</div>
            <p className="text-[12px] text-[#a8a29e] leading-relaxed">
              选中文本后点击气泡按钮，<br />或直接输入问题
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-[#f5f5f4] rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#a8a29e] animate-bounce" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#a8a29e] animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#a8a29e] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-2 border-t border-[#f5f5f4]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="问 AI…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[#e7e5e4] bg-[#fafaf9] px-3 py-2 text-[12px] text-[#1c1917] placeholder:text-[#d6d3d1] outline-none focus:border-blue-400 transition-colors"
            style={{ maxHeight: '120px' }}
          />
          {isLoading ? (
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#f5f5f4] text-[#78716c] hover:bg-[#e7e5e4] transition-colors flex-shrink-0"
              onClick={onStopGeneration}
              title="停止生成"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!input.trim()}
              title="发送"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-1 text-center">
          <span className="text-[9px] text-[#d6d3d1]">Enter 发送 · Shift+Enter 换行</span>
        </div>
      </div>
    </div>
  );
}
