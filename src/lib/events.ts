/**
 * Event utilities for Molt Growth Loop.
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
  const safeIdempotencyKey = idempotencyKey
    ? String(idempotencyKey)
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 180)
    : null;
  return {
    _type: 'molt.event',
    _id: safeIdempotencyKey
      ? `molt.event.${safeIdempotencyKey}`
      : `molt.event.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
    type,
    actor,
    channel,
    timestamp: now,
    traceId: traceId || null,
    idempotencyKey: safeIdempotencyKey,
    entities: entities.map((e) => ({
      entityType: e.entityType,
      entityRef: { _type: 'reference', _ref: e._ref },
    })),
    payload: { text },
    outcome: outcome || null,
    tags: tags || [],
  };
}
