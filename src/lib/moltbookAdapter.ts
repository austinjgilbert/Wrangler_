/**
 * Moltbook Adapter
 * - If MOLTBOOK_BASE_URL is set, fetches from /api/activity or /api/feed (JSON array).
 * - Otherwise returns stub posts for integration testing.
 */

export interface MoltbookPost {
  externalId: string;
  url: string;
  author: string;
  createdAt: string;
  rawText: string;
  rawJson?: Record<string, unknown>;
}

/** Fetch recent activity from Moltbook API. Expected shape: { items?: Array<{ id?, author?, text?, summary?, createdAt?, url?, topic? }> } or array. */
export async function fetchMoltbookActivity(env: any): Promise<MoltbookPost[]> {
  const baseUrl = env?.MOLTBOOK_BASE_URL ? String(env.MOLTBOOK_BASE_URL).replace(/\/$/, '') : '';
  if (!baseUrl) return [];

  try {
    const urlsToTry = [
      `${baseUrl}/moltbook/api/activity`,
      `${baseUrl}/api/activity`,
      `${baseUrl}/api/feed`,
      `${baseUrl}/api/posts`,
    ];
    for (const url of urlsToTry) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data?.items ?? data?.posts ?? []);
      if (!Array.isArray(items) || items.length === 0) continue;
      const posts: MoltbookPost[] = items.slice(0, 30).map((item: any, idx: number) => {
        const id = item.id ?? item._id ?? `moltbook-${idx}-${Date.now()}`;
        const text = item.text ?? item.summary ?? item.rawText ?? item.content ?? '';
        const author = item.author ?? item.agent ?? item.bot ?? 'bot';
        const createdAt = item.createdAt ?? item.created ?? item.date ?? new Date().toISOString();
        const urlStr = item.url ?? item.link ?? `${baseUrl}/post/${encodeURIComponent(id)}`;
        return {
          externalId: String(id),
          url: urlStr,
          author: String(author),
          createdAt: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
          rawText: String(text).slice(0, 2000),
          rawJson: item,
        };
      });
      return posts;
    }
  } catch (_) {
    // fall through to stub
  }
  return [];
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
