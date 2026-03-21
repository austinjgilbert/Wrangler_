/**
 * Event utilities for Molt Growth Loop.
 *
 * buildActivityEvent() — new Index+Blob format for Activity System (Lane 2).
 * buildEventDoc() — legacy wrapper that adds Index+Blob fields automatically.
 *   All 16 existing call sites get dual-write for free via this wrapper.
 *
 * @see activity-system-architecture v1.0
 * @see molt-event-schema-definition v1.0
 */

// ── Types ───────────────────────────────────────────────────────────

export type ActivityEventType = 'prompt' | 'job' | 'data_write' | 'system' | 'capture';
export type ActivityStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ActivitySource = 'gpt' | 'extension' | 'worker' | 'cron' | 'app';
export type ActivityCategory = 'enrichment' | 'interaction' | 'capture' | 'research' | 'system';

export interface ActivityEventInput {
  eventType: ActivityEventType;
  status: ActivityStatus;
  source: ActivitySource;
  accountKey?: string | null;
  category: ActivityCategory;
  message: string;
  data?: Record<string, any>;
  idempotencyKey?: string;
}

// ── Index+Blob event builder (new) ──────────────────────────────────

/**
 * Build a molt.event document with Index+Blob fields.
 * Used directly by new emission points (5 new endpoints).
 * Also called internally by buildEventDoc() for dual-write.
 */
export function buildActivityEvent(input: ActivityEventInput) {
  const now = new Date().toISOString();
  const safeKey = sanitizeIdempotencyKey(input.idempotencyKey);

  return {
    _type: 'molt.event' as const,
    _id: safeKey
      ? `molt.event.${safeKey}`
      : `molt.event.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,

    // Index fields (queryable — ~6 attribute paths)
    eventType: input.eventType,
    status: input.status,
    source: input.source,
    accountKey: input.accountKey || null,
    timestamp: now,
    category: input.category,

    // Blob field (1 attribute path — all metadata)
    eventData: JSON.stringify({
      message: input.message,
      ...(input.data || {}),
    }),
  };
}

// ── Legacy event builder (wrapper — dual-write) ─────────────────────

/**
 * Legacy event builder. All 16 existing call sites use this.
 * Now adds Index+Blob fields alongside old fields for dual-write.
 * No signature change — existing callers are unaffected.
 */
export function buildEventDoc({
  type,
  text,
  channel,
  actor,
  entities,
  outcome,
  tags,
  traceId,
  idempotencyKey,
}: {
  type: string;
  text: string;
  channel: string;
  actor: string;
  entities: Array<{ _ref: string; entityType: string }>;
  outcome?: string;
  tags?: string[];
  traceId?: string;
  idempotencyKey?: string;
}) {
  const now = new Date().toISOString();
  const safeKey = sanitizeIdempotencyKey(idempotencyKey);

  // Derive Index+Blob fields from legacy params
  const mapped = mapLegacyToIndex(type, channel, actor, entities);

  return {
    _type: 'molt.event' as const,
    _id: safeKey
      ? `molt.event.${safeKey}`
      : `molt.event.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,

    // ── Legacy fields (backward compat — existing readers still work) ──
    type,
    actor,
    channel,
    timestamp: now,
    traceId: traceId || null,
    idempotencyKey: safeKey,
    entities: entities.map((e) => ({
      entityType: e.entityType,
      entityRef: { _type: 'reference', _ref: e._ref },
    })),
    payload: { text },
    outcome: outcome || null,
    tags: tags || [],

    // ── New Index+Blob fields (dual-write — ActivityFeed reads these) ──
    eventType: mapped.eventType,
    status: mapped.status,
    source: mapped.source,
    accountKey: extractAccountKey(entities),
    category: mapped.category,
    eventData: JSON.stringify({
      message: text,
      actor,
      channel,
      traceId: traceId || null,
      idempotencyKey: safeKey,
      entities: entities.map((e) => ({
        entityType: e.entityType,
        entityId: e._ref,
      })),
      outcome: outcome || null,
      tags: tags || [],
    }),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function sanitizeIdempotencyKey(key?: string): string | null {
  if (!key) return null;
  return String(key)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}

/**
 * Extract accountKey from legacy entities array.
 * Looks for entity with entityType 'account' and strips the prefix.
 */
function extractAccountKey(
  entities: Array<{ _ref: string; entityType: string }>
): string | null {
  const accountEntity = entities.find((e) => e.entityType === 'account');
  if (!accountEntity) return null;
  // _ref is like 'account.adfff294ce4fb49c' or 'account-adfff294ce4fb49c'
  return accountEntity._ref.replace(/^account[.-]/, '') || accountEntity._ref;
}

/**
 * Map legacy event type/channel/actor to new Index+Blob fields.
 * Based on production data: 8 known event types mapped to Austin's categories.
 * Unknown types default to system/completed/worker/system.
 */
function mapLegacyToIndex(
  type: string,
  channel: string,
  actor: string,
  _entities: Array<{ _ref: string; entityType: string }>
): {
  eventType: ActivityEventType;
  status: ActivityStatus;
  source: ActivitySource;
  category: ActivityCategory;
} {
  // Map known legacy event types to new index fields
  const TYPE_MAP: Record<
    string,
    {
      eventType: ActivityEventType;
      category: ActivityCategory;
      source?: ActivitySource;
    }
  > = {
    // Prompt / interaction events
    'wrangler.interaction': { eventType: 'prompt', category: 'interaction', source: 'gpt' },
    'request.received': { eventType: 'prompt', category: 'interaction' },

    // Extension capture events
    'extension.capture': { eventType: 'capture', category: 'capture', source: 'extension' },

    // Enrichment / job events
    'enrich.applied': { eventType: 'job', category: 'enrichment' },
    'enrich.approved': { eventType: 'job', category: 'enrichment' },

    // System events
    'brief.daily': { eventType: 'system', category: 'system', source: 'cron' },
    'intelligence.nightly': { eventType: 'system', category: 'system', source: 'cron' },
    'system.self-heal': { eventType: 'system', category: 'system' },
    'approval.requested': { eventType: 'system', category: 'system' },
    'approval.rejected': { eventType: 'system', category: 'system' },
    'approval.approved': { eventType: 'system', category: 'system' },
    'superuser.rerank_actions': { eventType: 'system', category: 'system', source: 'app' },

    // Call events
    'call.ingested': { eventType: 'data_write', category: 'interaction', source: 'app' },
    'call.reprocessed': { eventType: 'system', category: 'system' },

    // Dynamic molt.ts types
    'reply.received': { eventType: 'data_write', category: 'interaction', source: 'app' },
    'touch.sent': { eventType: 'data_write', category: 'interaction', source: 'app' },
    'note.captured': { eventType: 'data_write', category: 'interaction', source: 'app' },
  };

  const mapped = TYPE_MAP[type];

  // Derive source from channel/actor if not in the map
  const source: ActivitySource = mapped?.source || deriveSource(channel, actor);

  return {
    eventType: mapped?.eventType || 'system',
    status: 'completed' as ActivityStatus, // Legacy events are always post-facto
    source,
    category: mapped?.category || 'system',
  };
}

/**
 * Derive ActivitySource from legacy channel/actor fields.
 */
function deriveSource(channel: string, actor: string): ActivitySource {
  if (channel === 'extension' || actor === 'chrome_extension') return 'extension';
  if (channel === 'wrangler' || actor === 'wrangler') return 'gpt';
  if (channel === 'system' || actor === 'moltbot') return 'worker';
  if (actor === 'superuser') return 'app';
  return 'worker';
}
