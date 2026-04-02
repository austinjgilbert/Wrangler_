/**
 * Audit — Full interaction audit logging for the chat module.
 *
 * Every chat interaction is logged to KV with structured data for
 * behavioral analysis, debugging, and feedback capture.
 *
 * KV key schema:
 *   audit:entry:{timestamp}:{turnId}   — individual entries (30-day TTL)
 *   audit:session:{sessionId}          — session index of turnIds (30-day TTL)
 *   audit:feedback:{turnId}            — feedback records (90-day TTL)
 *   audit:recent                       — rolling list of recent entry keys (30-day TTL)
 *
 * @module chat/audit
 */

import type { AuditEntry } from './types.ts';

// ─── Constants ──────────────────────────────────────────────────────────────

const TTL_30_DAYS = 60 * 60 * 24 * 30;
const TTL_90_DAYS = 60 * 60 * 24 * 90;
const RECENT_ENTRIES_KEY = 'audit:recent';
const MAX_RECENT_ENTRIES = 500;

// ─── Key builders ───────────────────────────────────────────────────────────

function entryKey(timestamp: string, turnId: string): string {
  return `audit:entry:${timestamp}:${turnId}`;
}

function sessionKey(sessionId: string): string {
  return `audit:session:${sessionId}`;
}

function feedbackKey(turnId: string): string {
  return `audit:feedback:${turnId}`;
}

// ─── Log Interaction ────────────────────────────────────────────────────────

/**
 * Write a full audit entry for a chat interaction.
 *
 * Stores the entry itself, updates the session index, and appends
 * to the rolling recent-entries list.
 */
export async function logInteraction(env: any, entry: AuditEntry): Promise<void> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) {
    console.warn('[chat/audit] KV namespace not available — skipping audit log');
    return;
  }

  const key = entryKey(entry.timestamp, entry.turnId);

  try {
    // 1. Write the entry itself
    await kv.put(key, JSON.stringify(entry), { expirationTtl: TTL_30_DAYS });

    // 2. Update session index (append turnId)
    const sessKey = sessionKey(entry.sessionId);
    const existing = await kv.get(sessKey, 'json').catch(() => null);
    const sessionIndex: string[] = Array.isArray(existing) ? existing : [];
    sessionIndex.push(entry.turnId);
    await kv.put(sessKey, JSON.stringify(sessionIndex), { expirationTtl: TTL_30_DAYS });

    // 3. Append to recent entries list (capped)
    const recentRaw = await kv.get(RECENT_ENTRIES_KEY, 'json').catch(() => null);
    const recent: string[] = Array.isArray(recentRaw) ? recentRaw : [];
    recent.push(key);
    // Keep only the most recent entries
    const trimmed = recent.length > MAX_RECENT_ENTRIES
      ? recent.slice(recent.length - MAX_RECENT_ENTRIES)
      : recent;
    await kv.put(RECENT_ENTRIES_KEY, JSON.stringify(trimmed), { expirationTtl: TTL_30_DAYS });
  } catch (err: any) {
    // Audit logging should never break the chat flow
    console.error('[chat/audit] Failed to log interaction:', err?.message || err);
  }
}

// ─── Record Feedback ────────────────────────────────────────────────────────

/**
 * Record user feedback (thumbs up/down + optional text) for a turn.
 *
 * Updates both the feedback record and the original audit entry.
 */
export async function recordFeedback(
  env: any,
  sessionId: string,
  turnId: string,
  feedback: 'up' | 'down',
  feedbackText?: string,
): Promise<void> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) {
    console.warn('[chat/audit] KV namespace not available — skipping feedback');
    return;
  }

  try {
    // 1. Write dedicated feedback record (longer TTL for analysis)
    const fbKey = feedbackKey(turnId);
    const feedbackRecord = {
      sessionId,
      turnId,
      feedback,
      feedbackText: feedbackText || null,
      recordedAt: new Date().toISOString(),
    };
    await kv.put(fbKey, JSON.stringify(feedbackRecord), { expirationTtl: TTL_90_DAYS });

    // 2. Try to update the original audit entry with feedback
    const sessKey = sessionKey(sessionId);
    const sessionIndex: string[] = (await kv.get(sessKey, 'json').catch(() => null)) || [];

    // Find the entry key that contains this turnId
    // We need to scan recent entries or reconstruct the key
    const recentRaw = await kv.get(RECENT_ENTRIES_KEY, 'json').catch(() => null);
    const recent: string[] = Array.isArray(recentRaw) ? recentRaw : [];
    const matchingKey = recent.find((k) => k.endsWith(`:${turnId}`));

    if (matchingKey) {
      const entryRaw = await kv.get(matchingKey, 'json').catch(() => null);
      if (entryRaw) {
        const entry = entryRaw as AuditEntry;
        entry.feedback = feedback;
        entry.feedbackText = feedbackText;
        await kv.put(matchingKey, JSON.stringify(entry), { expirationTtl: TTL_30_DAYS });
      }
    }
  } catch (err: any) {
    console.error('[chat/audit] Failed to record feedback:', err?.message || err);
  }
}

// ─── Query: Recent Entries ──────────────────────────────────────────────────

/**
 * Retrieve the most recent audit entries for analysis.
 *
 * @param limit - Max entries to return (default 50)
 */
export async function getRecentAuditEntries(
  env: any,
  limit: number = 50,
): Promise<AuditEntry[]> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) return [];

  try {
    const recentRaw = await kv.get(RECENT_ENTRIES_KEY, 'json').catch(() => null);
    const recent: string[] = Array.isArray(recentRaw) ? recentRaw : [];

    // Take the last N keys
    const keys = recent.slice(-limit);

    // Fetch entries in parallel (batch of up to 50)
    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          return await kv.get(key, 'json');
        } catch {
          return null;
        }
      }),
    );

    return entries.filter(Boolean) as AuditEntry[];
  } catch (err: any) {
    console.error('[chat/audit] Failed to get recent entries:', err?.message || err);
    return [];
  }
}

// ─── Query: Session Trail ───────────────────────────────────────────────────

/**
 * Retrieve all audit entries for a specific session, in order.
 */
export async function getSessionAuditTrail(
  env: any,
  sessionId: string,
): Promise<AuditEntry[]> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) return [];

  try {
    const sessKey = sessionKey(sessionId);
    const turnIds: string[] = (await kv.get(sessKey, 'json').catch(() => null)) || [];

    if (turnIds.length === 0) return [];

    // We need to find the full keys for these turnIds
    // Use KV list with prefix to find matching entries
    const entries: AuditEntry[] = [];

    // Fetch from recent entries index to find matching keys
    const recentRaw = await kv.get(RECENT_ENTRIES_KEY, 'json').catch(() => null);
    const recent: string[] = Array.isArray(recentRaw) ? recentRaw : [];

    const turnIdSet = new Set(turnIds);
    const matchingKeys = recent.filter((key) => {
      const parts = key.split(':');
      const keyTurnId = parts[parts.length - 1];
      return turnIdSet.has(keyTurnId);
    });

    // Also try KV list as fallback for entries that may have fallen off the recent list
    if (matchingKeys.length < turnIds.length) {
      const listResult = await kv.list({ prefix: 'audit:entry:' }).catch(() => ({ keys: [] }));
      for (const { name } of listResult.keys) {
        const parts = name.split(':');
        const keyTurnId = parts[parts.length - 1];
        if (turnIdSet.has(keyTurnId) && !matchingKeys.includes(name)) {
          matchingKeys.push(name);
        }
      }
    }

    // Fetch all matching entries
    const fetched = await Promise.all(
      matchingKeys.map(async (key) => {
        try {
          return await kv.get(key, 'json');
        } catch {
          return null;
        }
      }),
    );

    return fetched
      .filter(Boolean)
      .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp)) as AuditEntry[];
  } catch (err: any) {
    console.error('[chat/audit] Failed to get session trail:', err?.message || err);
    return [];
  }
}
