import { proxyToWorker } from '@/lib/server-proxy';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const qs = '';
  return proxyToWorker(`/enrich/queue${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
