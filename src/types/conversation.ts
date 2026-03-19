export interface MessageUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  ttftMs?: number;
  model?: string;
  cached?: boolean;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  status?: 'sent' | 'thinking' | 'streaming' | 'error';
  usage?: MessageUsage;
  requestContent?: string;
  routeIntent?: 'chat' | 'doc_qa' | 'term';
  routeConfidence?: number;
  inputMode?: 'auto' | 'chat' | 'doc';
}

export interface ConversationHistory {
  id: string;
  documentId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
