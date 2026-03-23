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

export type ChatInputMode = 'auto' | 'chat' | 'doc';
export type ThemeOption = 'light' | 'dark' | 'warm-dark' | 'sepia';

export interface UISettings {
  showChatPerfHints: boolean;
  chatInputModeDefault: ChatInputMode;
  rememberRoutePreferenceAcrossSessions: boolean;
  theme?: ThemeOption;
}

export interface Settings {
  ai: AIConfig;
  ui?: UISettings;
  theme?: 'light' | 'dark';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
