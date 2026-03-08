import type { ActionCandidateType, SignalType, UncertaintyState } from '../../shared/types.ts';

export const FRESHNESS_WINDOWS_HOURS: Record<string, number> = {
  signup: 24,
  pricing_page_visit: 48,
  intent_spike: 72,
  job_posting: 24 * 14,
  website_scan: 24 * 7,
  linkedin_context: 24 * 5,
  mql: 24 * 3,
  slack_alert: 24,
  routing_signal: 24,
  operator_note: 24 * 7,
  send_email: 72,
  send_linkedin_message: 48,
  make_call: 24,
  create_followup_task: 24 * 5,
  run_targeted_research: 24,
  evidence: 24 * 14,
  entity: 24 * 30,
  pattern: 24 * 14,
  draft: 72,
};

export function resolveSignalStaleAfter(signalType: SignalType, observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS[String(signalType)] || FRESHNESS_WINDOWS_HOURS.website_scan);
}

export function resolveActionStaleAfter(actionType: ActionCandidateType, observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS[String(actionType)] || FRESHNESS_WINDOWS_HOURS.create_followup_task);
}

export function resolveEvidenceStaleAfter(observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS.evidence);
}

export function resolveEntityStaleAfter(observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS.entity);
}

export function resolvePatternStaleAfter(observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS.pattern);
}

export function resolveDraftStaleAfter(observedAt: string): string {
  return addHours(observedAt, FRESHNESS_WINDOWS_HOURS.draft);
}

export function deriveUncertaintyStateFromFreshness(input: {
  observedAt?: string;
  staleAfter?: string;
  confidence?: number;
  contradictory?: boolean;
  needsValidation?: boolean;
  now?: string;
}): UncertaintyState {
  if (input.contradictory) return 'contradictory';
  if (input.needsValidation) return 'needs_validation';
  const now = new Date(input.now || new Date().toISOString()).getTime();
  const staleAfter = input.staleAfter ? new Date(input.staleAfter).getTime() : null;
  if (staleAfter != null && staleAfter <= now) return 'stale';
  const confidence = Number(input.confidence ?? 0.5);
  if (confidence < 0.4) return 'weakly_inferred';
  if (confidence < 0.75) return 'likely';
  return 'confirmed';
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + (hours * 60 * 60 * 1000)).toISOString();
}
