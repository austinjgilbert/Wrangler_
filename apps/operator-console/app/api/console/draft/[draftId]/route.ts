import { proxyToWorker } from '@/lib/server-proxy';

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  const { draftId } = await context.params;
  if (!draftId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing draftId' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  return proxyToWorker(`/operator/console/draft/${encodeURIComponent(draftId)}`);
}
