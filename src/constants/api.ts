export const API_ENDPOINTS = {
  ZHIPU_CHAT: 'https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_pro/invoke',
  MINIMAX_CHAT: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
} as const;

export const AI_MODELS = {
  ZHIPU_GLM4: 'glm-4',
  MINIMAX_ABAB65: 'abab6.5-chat',
} as const;
