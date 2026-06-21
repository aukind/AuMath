import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolvePanelContext } from '@/lib/agent/context';
import { runAgent } from '@/lib/agent/loop';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 会话探测：前端据此决定是否渲染 AI 面板（未登录返回 401）。 */
export async function GET() {
  const ctx = await resolvePanelContext(false);
  if (!ctx) return new Response('unauthorized', { status: 401 });
  return Response.json({ userId: ctx.userId, isAdmin: ctx.isAdmin });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; autopilot?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const ctx = await resolvePanelContext(body.autopilot === true);
  if (!ctx) return new Response('unauthorized', { status: 401 });

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: Anthropic.MessageParam[] = raw
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  if (!messages.length) return new Response('no messages', { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(ctx, messages)) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'stream error';
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
