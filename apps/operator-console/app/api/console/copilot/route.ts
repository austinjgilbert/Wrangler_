import { proxyToWorker } from '@/lib/server-proxy';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  return proxyToWorker(`/operator/console/copilot${params ? `?${params}` : ''}`);
}
