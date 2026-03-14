import { proxyToWorker } from '@/lib/server-proxy';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return proxyToWorker(`/enrich/research${qs}`);
}
