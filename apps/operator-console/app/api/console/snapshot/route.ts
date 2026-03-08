import { proxyToWorker } from '@/lib/server-proxy';

export async function GET() {
  return proxyToWorker('/operator/console/snapshot');
}
