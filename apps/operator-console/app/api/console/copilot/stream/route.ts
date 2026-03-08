import { workerHeaders, workerBaseUrl } from '@/lib/server-proxy';

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${workerBaseUrl()}/operator/console/copilot/query`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await upstream.json();
  if (!upstream.ok || !payload?.ok) {
    return Response.json(payload, { status: upstream.status });
  }

  const result = payload.data;
  const responseText = String(result?.response || '');
  const chunks = responseText.split(/\s+/).filter(Boolean);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'message', chunk: `${chunk} ` })}\n`));
        await sleep(22);
      }
      controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'result', data: result })}\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
