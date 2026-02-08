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
  return {
    _type: 'molt.event',
    _id: idempotencyKey
      ? `molt.event.${idempotencyKey}`
      : `molt.event.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
    type,
    actor,
    channel,
    timestamp: now,
    traceId: traceId || null,
    idempotencyKey: idempotencyKey || null,
    entities: entities.map((e) => ({
      entityType: e.entityType,
      entityRef: { _type: 'reference', _ref: e._ref },
    })),
    payload: { text },
    outcome: outcome || null,
    tags: tags || [],
  };
}
