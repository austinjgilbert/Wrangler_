/**
 * Stale-while-revalidate cache for worker API responses.
 *
 * Per-key TTLs:
 *   briefing/snapshot/accounts: 60s
 *   default: 30s
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const KEY_TTLS: Record<string, number> = {
  briefing: 60_000,
  snapshot: 60_000,
  accounts: 60_000,
};

const DEFAULT_TTL = 30_000;

function getTtl(key: string): number {
  return KEY_TTLS[key] ?? DEFAULT_TTL;
}

export function getCached<T>(key: string): { data: T; fresh: boolean } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  return {
    data: entry.data,
    fresh: age < entry.ttl,
  };
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: getTtl(key),
  });
}

export function clearCache(): void {
  cache.clear();
}

export function invalidateCache(key: string): void {
  cache.delete(key);
}
