export type AIProvider = 'zhipu' | 'minimax';

export interface Settings {
  provider: AIProvider;
  apiKey: string;
  theme?: 'light' | 'dark';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
