import { proxyToWorker } from '@/lib/server-proxy';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing id' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  return proxyToWorker(`/operator/console/job/${encodeURIComponent(id)}`);
}
