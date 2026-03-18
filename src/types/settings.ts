export type AIProvider = 'zhipu' | 'zhipu_coding' | 'minimax' | 'openai_compatible' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface AIProfile {
  id: string;
  name: string;
  config: AIConfig;
}

export interface Settings {
  ai: AIConfig;
  theme?: 'light' | 'dark';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
