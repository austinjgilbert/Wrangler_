import { workerBaseUrl, workerHeaders } from '@/lib/server-proxy';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subPath = path.join('/');
  const targetUrl = `${workerBaseUrl()}/api/chat/${subPath}`;

  const headers: Record<string, string> = {
    ...workerHeaders(),
  };

  // Forward content-type from the original request if present
  const ct = request.headers.get('content-type');
  if (ct) {
    headers['content-type'] = ct;
  }

  const isStreaming = subPath === 'stream';

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  // Forward body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    init.body = await request.text();
  }

  const upstream = await fetch(targetUrl, init);

  if (isStreaming && upstream.ok && upstream.body) {
    // Pipe the NDJSON stream through without buffering
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'transfer-encoding': 'chunked',
      },
    });
  }

  // Non-streaming: forward the response as-is
  const payload = await upstream.text();
  return new Response(payload, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
    },
  });
}

export const GET = handler;
export const POST = handler;
