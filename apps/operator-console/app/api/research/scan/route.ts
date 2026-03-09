import { proxyToWorker } from '@/lib/server-proxy'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const url = String(body?.url || '').trim()

  if (!url) {
    return Response.json(
      { ok: false, error: { message: 'url is required' } },
      { status: 400 },
    )
  }

  return proxyToWorker(`/scan?url=${encodeURIComponent(url)}`)
}
