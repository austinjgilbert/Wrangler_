import { proxyToWorker } from '@/lib/server-proxy';

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToWorker('/operator/console/command', {
    method: 'POST',
    body,
  });
}
