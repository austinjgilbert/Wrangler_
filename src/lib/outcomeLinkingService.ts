import type { OutcomeEvent } from '../../shared/types.ts';
import { createOutcomeEvent, updateActionCandidate } from './sanity.ts';

export function buildOutcomeEvent(input: Omit<OutcomeEvent, '_type' | '_id' | 'outcomeEventId'> & { outcomeEventId?: string }): OutcomeEvent {
  const outcomeEventId = input.outcomeEventId || `outcomeEvent.${safeId(input.actionCandidateId)}.${safeId(input.eventType)}.${new Date(input.observedAt).toISOString().slice(0, 10)}`;
  return {
    _type: 'outcomeEvent',
    _id: outcomeEventId,
    outcomeEventId,
    ...input,
  };
}

export async function recordOutcomeEvent(env: any, input: Omit<OutcomeEvent, '_type' | '_id' | 'outcomeEventId'> & { outcomeEventId?: string }) {
  const event = buildOutcomeEvent(input);
  await createOutcomeEvent(env, event);

  const patch: Record<string, any> = {
    latestOutcomeEventId: event.outcomeEventId,
    lastValidatedAt: event.observedAt,
    updatedAt: event.observedAt,
  };
  if (event.eventType === 'meeting_booked') patch.lifecycleStatus = 'completed';
  if (event.eventType === 'ignored' || event.eventType === 'bad_fit' || event.eventType === 'wrong_person' || event.eventType === 'wrong_timing') {
    patch.uncertaintyState = 'needs_validation';
  }
  await updateActionCandidate(env, event.actionCandidateId, patch);

  return event;
}

function safeId(value: string): string {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}
