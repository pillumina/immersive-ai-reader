import { NextRequest, NextResponse } from 'next/server';
import { callZhipuAPI, callMinimaxAPI } from '@/lib/ai/clients';
import { AIProvider } from '@/types/settings';

export async function POST(request: NextRequest) {
  try {
    const { message, documentId, provider, apiKey, history } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    // Build messages array
    const messages = [
      ...history,
      { role: 'user' as const, content: message }
    ];

    // Call appropriate AI API
    const stream = provider === 'zhipu'
      ? await callZhipuAPI(apiKey, messages)
      : await callMinimaxAPI(apiKey, messages);

    // Return streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
