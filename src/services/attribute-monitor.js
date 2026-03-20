/**
 * Sanity Attribute Monitor
 * Checks attribute usage and sets protection flags in KV.
 *
 * Called by: 6-hour cron in handleScheduled()
 * Reads: Sanity stats API (no auth required)
 * Writes: KV flags that Layer 3 (write guard) reads
 */

const PROJECT_ID = 'nlqb7zmk';
const DATASET = 'production';
const STATS_URL = `https://${PROJECT_ID}.api.sanity.io/v1/data/stats/${DATASET}`;

// Thresholds (absolute counts for free plan limit of 2,000)
const THRESHOLDS = {
  WARNING:  1600,  // 80% — start paying attention
  CRITICAL: 1800,  // 90% — block schema-expanding writes (Phase B)
  WALL:     1950,  // 97.5% — block all non-essential writes (Phase B)
};

/**
 * Check attribute count and update KV protection flags.
 *
 * @param {object} env - Worker env (needs RATE_LIMIT_KV namespace)
 * @returns {{ used: number, limit: number, remaining: number, level: string, action: string, pct: string } | { error: true, status: number }}
 */
export async function checkAttributeHealth(env) {
  try {
    const res = await fetch(STATS_URL);
    if (!res.ok) {
      console.error(`[attr-monitor] Stats API returned ${res.status}`);
      return { error: true, status: res.status };
    }

    const stats = await res.json();
    const used = stats?.fields?.count?.value;
    const limit = stats?.fields?.count?.limit;

    if (typeof used !== 'number' || typeof limit !== 'number') {
      console.error('[attr-monitor] Unexpected stats shape:', JSON.stringify(stats).slice(0, 200));
      return { error: true, status: 0 };
    }

    const remaining = limit - used;
    const pct = ((used / limit) * 100).toFixed(1);

    // Determine level
    let level, action;
    if (used >= THRESHOLDS.WALL) {
      level = 'wall';
      action = 'block-all-non-essential';
      console.error(`[attr-monitor] 💀 AT THE WALL: ${used}/${limit} (${pct}%) — blocking non-essential writes`);
    } else if (used >= THRESHOLDS.CRITICAL) {
      level = 'critical';
      action = 'block-schema-expanding';
      console.error(`[attr-monitor] 🔴 CRITICAL: ${used}/${limit} (${pct}%) — blocking schema-expanding writes`);
    } else if (used >= THRESHOLDS.WARNING) {
      level = 'warning';
      action = 'warn';
      console.warn(`[attr-monitor] 🟡 WARNING: ${used}/${limit} (${pct}%)`);
    } else {
      level = 'healthy';
      action = 'none';
      console.log(`[attr-monitor] 🟢 Healthy: ${used}/${limit} (${pct}%)`);
    }

    // Store in KV for Layer 3 to read (TTL: 7 hours — slightly longer than cron interval)
    const kv = env?.RATE_LIMIT_KV;
    if (kv) {
      await kv.put('sanity:attribute-health', JSON.stringify({
        used, limit, remaining, level, action, pct,
        checkedAt: new Date().toISOString(),
      }), { expirationTtl: 7 * 60 * 60 }); // 7 hours
    }

    return { used, limit, remaining, level, action, pct };
  } catch (err) {
    console.error('[attr-monitor] Health check failed:', err?.message || err);
    return { error: true, status: 0 };
  }
}

/**
 * Read the cached attribute health from KV.
 * Called by Layer 3 (write guard) on every mutation — Phase B.
 * Fast: single KV read, no external API call.
 *
 * @param {object} env - Worker env
 * @returns {{ level: string, action: string, used: number, remaining: number } | null}
 */
export async function getAttributeHealth(env) {
  const kv = env?.RATE_LIMIT_KV;
  if (!kv) return null; // no KV = no guardrails (dev mode)

  try {
    const raw = await kv.get('sanity:attribute-health');
    if (!raw) return null; // no check has run yet
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
