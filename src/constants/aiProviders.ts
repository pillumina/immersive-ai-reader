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
    label: 'Zhipu (Standard)',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4/',
    defaultModel: 'glm-5',
  },
  {
    id: 'zhipu_coding',
    label: 'Zhipu (Coding)',
    defaultEndpoint: 'https://open.bigmodel.cn/api/coding/paas/v4/',
    defaultModel: 'glm-5',
  },
  {
    id: 'minimax',
    label: 'Minimax',
    defaultEndpoint: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M2.7',
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

