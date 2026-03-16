'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Message } from '@/types/conversation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface AIPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
}

export function AIPanel({ messages, isLoading, onSendMessage }: AIPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <aside className="w-[380px] border-l border-[#E8E8E8] bg-white flex flex-col">
      <div className="p-4 border-b border-[#E8E8E8]">
        <h2 className="text-lg font-semibold">AI Assistant</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-gray-400 text-sm text-center">
            Ask questions about your document
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-[#E42313] text-white'
                  : 'bg-gray-100 text-black'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#E8E8E8]">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question..."
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send size={20} />
          </Button>
        </div>
      </div>
    </aside>
  );
}
