import type { SignalEvent, SignalSource, SignalType, SanityReference } from '../../shared/types.ts';
import { createSignal, fetchDocumentsByIds, patchEntity } from './sanity.ts';
import { enqueueActionCandidateJob } from './jobs.ts';
import { deriveUncertaintyStateFromFreshness, resolveSignalStaleAfter } from './freshnessPolicy.ts';

type NormalizeSignalInput = {
  id?: string;
  source: SignalSource | string;
  signalType?: SignalType;
  account?: SanityReference | null;
  person?: SanityReference | null;
  strength?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
};

/**
 * Signal half-life examples used by decay:
 * - signup = 24 hours
 * - pricing page visit = 48 hours
 * - intent spike = 72 hours
 * - job posting = 14 days
 */
export const SIGNAL_HALF_LIFE_HOURS: Record<string, number> = {
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
};

export function normalizeSignal(input: NormalizeSignalInput): SignalEvent {
  const source = normalizeSignalSource(input.source);
  const signalType = normalizeSignalType(input.signalType, source, input.metadata);
  const timestamp = input.timestamp || new Date().toISOString();
  const baseStrength = clampNumber(
    input.strength ?? inferBaseStrength(signalType, source, input.metadata),
    0,
    1,
  );
  const halfLifeHours = resolveSignalHalfLifeHours(signalType);
  const dedupeKey = buildSignalDedupeKey({
    source,
    signalType,
    accountRef: input.account?._ref,
    personRef: input.person?._ref,
    timestamp,
    metadata: input.metadata || {},
  });
  const strength = calculateDecayedSignalStrength({
    baseStrength,
    signalType,
    timestamp,
    now: observedAt,
  });
  const id = input.id || buildSignalId(dedupeKey);
  const observedAt = timestamp;
  const staleAfter = resolveSignalStaleAfter(signalType, observedAt);

  return {
    _type: 'signal',
    _id: id,
    id,
    dedupeKey,
    observedAt,
    lastValidatedAt: observedAt,
    staleAfter,
    refreshPriority: Math.max(25, Math.round(baseStrength * 100)),
    uncertaintyState: deriveUncertaintyStateFromFreshness({
      confidence: strength,
      observedAt,
      staleAfter,
      // Normalize uncertainty relative to the observation time so replayed fixtures
      // and backfilled signals do not immediately become "stale" at ingest.
      now: observedAt,
    }),
    source,
    signalType,
    account: input.account ? normalizeRef(input.account) : null,
    person: input.person ? normalizeRef(input.person) : null,
    strength,
    timestamp,
    metadata: {
      ...(input.metadata || {}),
      source,
      signalType,
      baseStrength,
      halfLifeHours,
      decayedStrength: strength,
      dedupeKey,
      normalizedAt: new Date().toISOString(),
      observedAt,
      staleAfter,
    },
  };
}

export async function storeSignal(env: any, input: NormalizeSignalInput | SignalEvent): Promise<SignalEvent> {
  const signal = isNormalizedSignalEvent(input) ? input : normalizeSignal(input);
  const legacySummary = buildSignalSummary(signal);
  const doc = {
    ...signal,
    type: signal.signalType,
    companyRef: signal.account ? { _type: 'reference', _ref: signal.account._ref } : null,
    personRefs: signal.person ? [{ _type: 'reference', _ref: signal.person._ref }] : [],
    sourceUrl: signal.metadata?.sourceUrl || null,
    date: signal.timestamp,
    summary: legacySummary,
    keywords: Array.isArray(signal.metadata?.keywords) ? signal.metadata.keywords : [],
    citations: Array.isArray(signal.metadata?.citations) ? signal.metadata.citations : [],
  };

  await createSignal(env, doc);
  return signal;
}

export async function attachSignalToEntity(env: any, signalLike: NormalizeSignalInput | SignalEvent): Promise<{
  signal: SignalEvent;
  accountUpdated: boolean;
  personUpdated: boolean;
}> {
  const signal = isNormalizedSignalEvent(signalLike) ? signalLike : normalizeSignal(signalLike);
  const summary = buildSignalSummary(signal);
  let accountUpdated = false;
  let personUpdated = false;

  const refs = [signal.account?._ref, signal.person?._ref].filter(Boolean) as string[];
  if (refs.length === 0) {
    return { signal, accountUpdated, personUpdated };
  }

  const docs = await fetchDocumentsByIds(env, refs);
  for (const doc of docs) {
    const existingSignals = Array.isArray(doc?.signals) ? doc.signals : [];
    const nextSignals = uniqueStrings([summary, ...existingSignals]).slice(0, 30);
    if (doc?._type === 'account') {
      await patchEntity(env, doc._id, {
        signals: nextSignals,
        updatedAt: new Date().toISOString(),
      });
      accountUpdated = true;
    }
    if (doc?._type === 'person') {
      await patchEntity(env, doc._id, {
        signals: nextSignals,
        updatedAt: new Date().toISOString(),
      });
      personUpdated = true;
    }
  }

  return { signal, accountUpdated, personUpdated };
}

export async function triggerActionCandidateEvaluation(env: any, signalLike: NormalizeSignalInput | SignalEvent): Promise<any> {
  const signal = isNormalizedSignalEvent(signalLike) ? signalLike : normalizeSignal(signalLike);
  if (!signal.account?._ref) {
    return { queued: false, reason: 'signal_missing_account' };
  }

  const shouldQueue = shouldTriggerActionEvaluation(signal);
  if (!shouldQueue) {
    return { queued: false, reason: 'signal_below_threshold', strength: signal.strength };
  }

  const job = await enqueueActionCandidateJob({
    env,
    accountRef: signal.account._ref,
    personRef: signal.person?._ref || null,
    traceId: signal.id,
    priority: mapSignalToJobPriority(signal),
  });
  return { queued: true, jobId: job._id, strength: signal.strength };
}

export function calculateDecayedSignalStrength(input: {
  baseStrength: number;
  signalType: SignalType;
  timestamp: string;
  now?: string;
}): number {
  const nowMs = new Date(input.now || new Date().toISOString()).getTime();
  const tsMs = new Date(input.timestamp).getTime();
  const ageHours = Math.max(0, (nowMs - tsMs) / (1000 * 60 * 60));
  const halfLifeHours = resolveSignalHalfLifeHours(input.signalType);
  const decayed = input.baseStrength * Math.pow(0.5, ageHours / halfLifeHours);
  return clampNumber(decayed, 0, 1);
}

export function resolveSignalHalfLifeHours(signalType: SignalType): number {
  return SIGNAL_HALF_LIFE_HOURS[String(signalType)] || (24 * 7);
}

function normalizeSignalSource(source: string): SignalSource {
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized.includes('website') || normalized.includes('scan')) return 'website_scan';
  if (normalized.includes('linkedin') || normalized.includes('sales navigator')) return 'linkedin_sales_navigator';
  if (normalized.includes('mql')) return 'mql_event';
  if (normalized.includes('intent')) return 'intent_platform';
  if (normalized.includes('signup') || normalized.includes('product')) return 'product_signup';
  if (normalized.includes('slack')) return 'slack_alert';
  if (normalized.includes('leandata') || normalized.includes('routing')) return 'leandata_routing';
  return 'manual_operator_note';
}

function normalizeSignalType(signalType: any, source: SignalSource, metadata: Record<string, any> = {}): SignalType {
  const raw = String(signalType || metadata.signalType || metadata.eventType || '').trim().toLowerCase();
  if (raw.includes('signup')) return 'signup';
  if (raw.includes('pricing')) return 'pricing_page_visit';
  if (raw.includes('intent')) return 'intent_spike';
  if (raw.includes('job')) return 'job_posting';
  if (source === 'website_scan') return 'website_scan';
  if (source === 'linkedin_sales_navigator') return 'linkedin_context';
  if (source === 'mql_event') return 'mql';
  if (source === 'slack_alert') return 'slack_alert';
  if (source === 'leandata_routing') return 'routing_signal';
  return 'operator_note';
}

function inferBaseStrength(signalType: SignalType, source: SignalSource, metadata: Record<string, any> = {}): number {
  if (typeof metadata.strength === 'number') return metadata.strength;
  if (signalType === 'signup') return 0.95;
  if (signalType === 'pricing_page_visit') return 0.85;
  if (signalType === 'intent_spike') return 0.8;
  if (signalType === 'job_posting') return 0.55;
  if (source === 'mql_event') return 0.9;
  if (source === 'linkedin_sales_navigator') return 0.7;
  if (source === 'website_scan') return 0.65;
  if (source === 'slack_alert' || source === 'leandata_routing') return 0.75;
  return 0.5;
}

function shouldTriggerActionEvaluation(signal: SignalEvent): boolean {
  const strongTypes = new Set(['signup', 'pricing_page_visit', 'intent_spike', 'mql', 'routing_signal']);
  return signal.strength >= 0.35 || strongTypes.has(signal.signalType);
}

function mapSignalToJobPriority(signal: SignalEvent): number {
  if (signal.signalType === 'signup') return 95;
  if (signal.signalType === 'pricing_page_visit') return 90;
  if (signal.signalType === 'intent_spike') return 88;
  if (signal.signalType === 'mql') return 85;
  if (signal.signalType === 'routing_signal') return 82;
  return Math.max(55, Math.round(signal.strength * 100));
}

function buildSignalId(dedupeKey: string): string {
  return `signal.${safeId(dedupeKey)}`;
}

function buildSignalDedupeKey(input: {
  source: SignalSource;
  signalType: SignalType;
  accountRef?: string;
  personRef?: string;
  timestamp: string;
  metadata: Record<string, any>;
}): string {
  const sourceRef = input.accountRef || input.personRef || 'unattached';
  const sourceUrl = String(input.metadata?.sourceUrl || input.metadata?.url || '').trim();
  const externalId = String(input.metadata?.externalId || input.metadata?.eventId || input.metadata?.id || '').trim();
  const summary = String(input.metadata?.summary || '').trim().slice(0, 120).toLowerCase();
  const bucket = new Date(input.timestamp).toISOString().slice(0, 13);
  return [
    input.source,
    input.signalType,
    sourceRef,
    sourceUrl || externalId || summary || 'no-fingerprint',
    bucket,
  ].map(safeId).join('.');
}

function buildSignalSummary(signal: SignalEvent): string {
  const metaSummary = signal.metadata?.summary ? `${signal.metadata.summary}` : '';
  const base = `${signal.signalType} from ${signal.source}`;
  const strength = `strength ${signal.strength.toFixed(2)}`;
  return uniqueStrings([base, metaSummary, strength]).join(' | ');
}

function normalizeRef(ref: SanityReference): SanityReference {
  return { _type: 'reference', _ref: ref._ref };
}

function safeId(value: string): string {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function clampNumber(value: number, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function isNormalizedSignalEvent(input: NormalizeSignalInput | SignalEvent): input is SignalEvent {
  return !!(input as SignalEvent)?._type && (input as SignalEvent)?._type === 'signal' && typeof (input as SignalEvent)?.id === 'string';
}
