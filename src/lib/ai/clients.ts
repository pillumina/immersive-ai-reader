import { Message } from '@/types/conversation';
import { API_ENDPOINTS, AI_MODELS } from '@/constants/api';

export async function callZhipuAPI(
  apiKey: string,
  messages: Message[]
): Promise<ReadableStream> {
  const response = await fetch(API_ENDPOINTS.ZHIPU_CHAT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODELS.ZHIPU_GLM4,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Zhipu API error: ${response.statusText}`);
  }

  return response.body!;
}

export async function callMinimaxAPI(
  apiKey: string,
  messages: Message[]
): Promise<ReadableStream> {
  const response = await fetch(API_ENDPOINTS.MINIMAX_CHAT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODELS.MINIMAX_ABAB65,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Minimax API error: ${response.statusText}`);
  }

  return response.body!;
}
