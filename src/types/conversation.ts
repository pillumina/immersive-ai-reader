export interface MessageUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  model?: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  status?: 'sent' | 'thinking' | 'streaming' | 'error';
  usage?: MessageUsage;
  requestContent?: string;
}

export interface ConversationHistory {
  id: string;
  documentId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
