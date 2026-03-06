/**
 * Moltbook Adapter
 * - Fetches from MOLTBOOK_BASE_URL and optionally from MOLTBOOK_NETWORK_URLS (other AIs on the network).
 * - Each source can expose /api/activity, /api/feed, or /moltbook/api/activity (JSON array).
 */

export interface MoltbookPost {
  externalId: string;
  url: string;
  author: string;
  createdAt: string;
  rawText: string;
  rawJson?: Record<string, unknown>;
}

const ACTIVITY_PATHS = ['/moltbook/api/activity', '/api/activity', '/api/feed', '/api/posts'];

/** Fetch from a single base URL. Returns [] on failure or empty. */
async function fetchFromOneBase(baseUrl: string, sourceId: string, limit: number): Promise<MoltbookPost[]> {
  const base = baseUrl.replace(/\/$/, '');
  for (const path of ACTIVITY_PATHS) {
    try {
      const res = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown[] | { items?: unknown[]; posts?: unknown[] };
      const items = Array.isArray(data) ? data : (data && typeof data === 'object' ? (data.items ?? data.posts ?? []) : []);
      if (!Array.isArray(items) || items.length === 0) continue;
      return items.slice(0, limit).map((item: any, idx: number) => {
        const id = item.id ?? item._id ?? `post-${idx}-${Date.now()}`;
        const text = item.text ?? item.summary ?? item.rawText ?? item.content ?? '';
        const author = item.author ?? item.agent ?? item.bot ?? 'bot';
        const createdAt = item.createdAt ?? item.created ?? item.date ?? new Date().toISOString();
        const urlStr = item.url ?? item.link ?? `${base}/post/${encodeURIComponent(id)}`;
        return {
          externalId: `${sourceId}:${String(id)}`,
          url: urlStr,
          author: String(author),
          createdAt: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
          rawText: String(text).slice(0, 2000),
          rawJson: { ...item, _source: sourceId },
        };
      });
    } catch (_) {
      continue;
    }
  }
  return [];
}

/** Parse comma-separated URLs from env (e.g. MOLTBOOK_NETWORK_URLS). */
function parseNetworkUrls(env: any): string[] {
  const raw = env?.MOLTBOOK_NETWORK_URLS ? String(env.MOLTBOOK_NETWORK_URLS).trim() : '';
  if (!raw) return [];
  return raw.split(',').map((u: string) => u.trim()).filter(Boolean);
}

/**
 * Fetch activity from primary (MOLTBOOK_BASE_URL) and from other AIs (MOLTBOOK_NETWORK_URLS).
 * Merges, dedupes by externalId, sorts by createdAt desc. Limit 80 total.
 */
export async function fetchMoltbookActivity(env: any): Promise<MoltbookPost[]> {
  const primary = env?.MOLTBOOK_BASE_URL ? String(env.MOLTBOOK_BASE_URL).replace(/\/$/, '') : '';
  const extraUrls = parseNetworkUrls(env);
  const allBases = primary ? [primary, ...extraUrls] : [...extraUrls];
  if (allBases.length === 0) return [];

  const perSource = Math.max(20, Math.floor(80 / Math.max(1, allBases.length)));
  const seen = new Set<string>();
  const merged: MoltbookPost[] = [];

  for (let i = 0; i < allBases.length; i++) {
    const base = allBases[i];
    const sourceId = base.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_').slice(0, 32) || `source-${i}`;
    const posts = await fetchFromOneBase(base, sourceId, perSource);
    for (const p of posts) {
      if (seen.has(p.externalId)) continue;
      seen.add(p.externalId);
      merged.push(p);
    }
  }

  merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return merged.slice(0, 80);
}

export async function fetchMoltbookPosts({
  topics,
  limit = 10,
  env,
}: {
  topics: string[];
  limit?: number;
  env?: any;
}): Promise<MoltbookPost[]> {
  const baseUrl = env?.MOLTBOOK_BASE_URL ? String(env.MOLTBOOK_BASE_URL).replace(/\/$/, '') : '';
  if (baseUrl) {
    const activity = await fetchMoltbookActivity(env);
    if (activity.length > 0) {
      return activity.slice(0, limit);
    }
  }

  const now = new Date().toISOString();
  const safeTopics = Array.isArray(topics) ? topics : ['network'];
  return safeTopics.slice(0, Math.max(1, limit)).map((topic, idx) => ({
    externalId: `moltbook-${topic}-${idx}`,
    url: `https://moltbook.local/${encodeURIComponent(topic)}/${idx}`,
    author: `agent-${idx}`,
    createdAt: now,
    rawText: `Thread about ${topic}: community ideas and claims.`,
    rawJson: { topic, index: idx, createdAt: now },
  }));
}
