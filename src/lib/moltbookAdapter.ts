/**
 * Moltbook Adapter (placeholder)
 * Assumption: no public API yet; returns stub posts for now.
 */

export async function fetchMoltbookPosts({
  topics,
  limit = 10,
}: {
  topics: string[];
  limit?: number;
}) {
  const now = new Date().toISOString();
  const safeTopics = Array.isArray(topics) ? topics : [];

  // Placeholder: deterministic stub data for integration testing.
  const posts = safeTopics.slice(0, Math.max(1, limit)).map((topic, idx) => ({
    externalId: `moltbook-${topic}-${idx}`,
    url: `https://moltbook.local/${encodeURIComponent(topic)}/${idx}`,
    author: `agent-${idx}`,
    createdAt: now,
    rawText: `Thread about ${topic}: community ideas and claims.`,
    rawJson: { topic, index: idx, createdAt: now },
  }));

  return posts;
}
