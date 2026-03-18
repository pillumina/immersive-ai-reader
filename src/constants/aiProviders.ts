import { AIConfig, AIProvider } from '@/types/settings';

export interface AIProviderPreset {
  id: AIProvider;
  label: string;
  defaultEndpoint: string;
  defaultModel: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'zhipu',
    label: 'Zhipu',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4',
  },
  {
    id: 'minimax',
    label: 'Minimax',
    defaultEndpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    defaultModel: 'abab6.5-chat',
  },
  {
    id: 'openai_compatible',
    label: 'OpenAI Compatible',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'custom',
    label: 'Custom',
    defaultEndpoint: '',
    defaultModel: '',
  },
];

export function getPresetByProvider(provider: AIProvider): AIProviderPreset {
  return (
    AI_PROVIDER_PRESETS.find((p) => p.id === provider) || AI_PROVIDER_PRESETS[0]
  );
}

export function defaultAIConfig(provider: AIProvider = 'zhipu'): AIConfig {
  const preset = getPresetByProvider(provider);
  return {
    provider: preset.id,
    endpoint: preset.defaultEndpoint,
    model: preset.defaultModel,
    apiKey: '',
  };
}

