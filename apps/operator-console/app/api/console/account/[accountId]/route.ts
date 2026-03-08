import { proxyToWorker } from '@/lib/server-proxy';

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }) {
  const params = await context.params;
  return proxyToWorker(`/operator/console/account/${encodeURIComponent(params.accountId)}`);
}
