/**
 * Email tracking pixel and opens API.
 * GET /track/pixel?id=xxx - serves 1x1 GIF, records open with device/geo/read-receipt
 * GET /track/opens - returns recent opens (for extension polling)
 */

const PIXEL_GIF_BASE64 = 'R0lGOODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const EMAIL_OPENS_KEY = 'email_opens:recent';
const MAX_RECENT = 100;

function getRequestMetadata(request: Request): Record<string, string | undefined> {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  const ua = request.headers.get('user-agent') ?? undefined;
  const isMobile = ua ? /mobile|android|iphone|ipad|ipod|webos|blackberry|iemobile/i.test(ua) : undefined;
  return {
    userAgent: ua,
    acceptLanguage: request.headers.get('accept-language') ?? undefined,
    referer: request.headers.get('referer') ?? undefined,
    country: cf?.country as string | undefined,
    city: cf?.city as string | undefined,
    region: (cf?.region as string) ?? undefined,
    regionCode: (cf?.regionCode as string) ?? undefined,
    timezone: cf?.timezone as string | undefined,
    ip: request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    isMobile: isMobile !== undefined ? String(isMobile) : undefined,
  };
}

export async function handleTrackPixel(request: Request, env: any) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim();
  if (!id) {
    return new Response(PixelGif(), {
      status: 200,
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  }
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (kv) {
    try {
      const metaRaw = await kv.get(`email_track:${id}`);
      let to = url.searchParams.get('to') ?? '';
      let subject = url.searchParams.get('subject') ?? '';
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (meta.to != null) to = Array.isArray(meta.to) ? meta.to.join(', ') : String(meta.to);
          if (meta.subject != null) subject = String(meta.subject);
        } catch (_) {
          // ignore
        }
      }
      const openedAt = new Date().toISOString();
      const meta = getRequestMetadata(request);
      const entry = {
        id,
        to: String(to),
        subject: String(subject),
        openedAt,
        readReceipt: true,
        ...meta,
      };
      const existing = await kv.get(EMAIL_OPENS_KEY);
      let list: any[] = existing ? JSON.parse(existing) : [];
      list.unshift(entry);
      list = list.slice(0, MAX_RECENT);
      await kv.put(EMAIL_OPENS_KEY, JSON.stringify(list));
    } catch (_) {
      // ignore
    }
  }
  return new Response(PixelGif(), {
    status: 200,
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}

export async function handleTrackOpens(request: Request, env: any) {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  let list: any[] = [];
  if (kv) {
    try {
      const raw = await kv.get(EMAIL_OPENS_KEY);
      if (raw) list = JSON.parse(raw);
    } catch (_) {
      // ignore
    }
  }
  const limit = Math.min(50, Math.max(1, parseInt(String(new URL(request.url).searchParams.get('limit') || '20'), 10)));
  const recent = list.slice(0, limit);
  return new Response(JSON.stringify({ ok: true, opens: recent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function PixelGif(): ArrayBuffer {
  const binary = atob(PIXEL_GIF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
