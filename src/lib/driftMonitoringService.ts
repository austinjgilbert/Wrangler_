import type { DriftMetric, PatternLifecycleState, SignalEvent } from '../../shared/types.ts';
import {
  createDriftMetric,
  fetchActionCandidates,
  fetchDocumentsByType,
  fetchOutcomeEventsForActionCandidate,
  fetchPatternByType,
  fetchSignals,
  fetchActionCandidateById,
  upsertMoltPattern,
} from './sanity.ts';

export async function recomputeDriftMetrics(env: any, now: string = new Date().toISOString()) {
  const [candidates, signals, drafts] = await Promise.all([
    fetchActionCandidates(env),
    fetchSignals(env),
    fetchDocumentsByType(env, 'gmailDraft', 500),
  ]);

  const metrics: DriftMetric[] = [];
  metrics.push(buildDriftMetric('score_inflation', average(candidates.map((candidate: any) => Number(candidate.opportunityScore || 0))), now, {
    candidateCount: candidates.length,
  }));
  metrics.push(buildDriftMetric('stale_evidence_percentage', computeStaleEvidencePercentage(candidates, now), now, {
    candidateCount: candidates.length,
  }));
  metrics.push(buildDriftMetric('duplicate_action_rate', computeDuplicateActionRate(candidates), now, {
    candidateCount: candidates.length,
  }));
  metrics.push(buildDriftMetric('weak_draft_rate', computeWeakDraftRate(drafts), now, {
    draftCount: drafts.length,
  }));
  metrics.push(buildDriftMetric('signal_to_action_conversion', computeSignalToActionConversion(signals, candidates), now, {
    signalCount: signals.length,
    candidateCount: candidates.length,
  }));

  for (const metric of metrics) {
    await createDriftMetric(env, metric);
  }

  return metrics;
}

export async function recalculateSignalSourceReliability(env: any, now: string = new Date().toISOString()) {
  const signals = await fetchSignals(env) as SignalEvent[];
  const grouped = new Map<string, SignalEvent[]>();
  for (const signal of signals) {
    const list = grouped.get(signal.source) || [];
    list.push(signal);
    grouped.set(signal.source, list);
  }

  const metrics: DriftMetric[] = [];
  for (const [source, items] of grouped.entries()) {
    const reliability = average(items.map((item) => Number(item.strength || 0)));
    const metric = buildDriftMetric('signal_source_reliability', reliability, now, {
      source,
      sampleSize: items.length,
      duplicationFrequency: duplicationFrequency(items),
    });
    await createDriftMetric(env, metric);
    metrics.push(metric);
  }
  return metrics;
}

export async function retireStalePatterns(env: any, now: string = new Date().toISOString()) {
  const patternDoc = await fetchPatternByType(env, 'nightly.emergingPatterns');
  const patterns = Array.isArray(patternDoc?.successStats?.patterns) ? patternDoc.successStats.patterns : [];
  const retired = patterns
    .filter((pattern: any) => Number(pattern.signalCount || 0) <= 1 || Number(pattern.weightedScore || 0) < 1.5)
    .map((pattern: any) => ({
      key: pattern.key,
      lifecycleState: 'retired' as PatternLifecycleState,
      retiredAt: now,
    }));

  if (patternDoc?._id && retired.length > 0) {
    await upsertMoltPattern(env, {
      ...patternDoc,
      successStats: {
        ...(patternDoc.successStats || {}),
        retiredPatterns: retired,
      },
      lastUpdated: now,
    });
  }

  return retired;
}

export async function computeConfidenceOutcomeMismatch(env: any, actionCandidateIds: string[]) {
  const mismatches: Array<{ actionCandidateId: string; confidence: number; outcomeEventType: string }> = [];
  for (const id of actionCandidateIds) {
    const [candidate, outcomes] = await Promise.all([
      fetchActionCandidateById(env, id),
      fetchOutcomeEventsForActionCandidate(env, id),
    ]);
    const latest = outcomes[0];
    if (!candidate || !latest) continue;
    const confidence = Number(candidate.confidence || 0);
    if (confidence >= 0.75 && ['wrong_person', 'wrong_timing', 'bad_fit', 'ignored'].includes(latest.eventType)) {
      mismatches.push({ actionCandidateId: id, confidence, outcomeEventType: latest.eventType });
    }
  }
  return mismatches;
}

export function buildDriftMetric(metricType: DriftMetric['metricType'], value: number, observedAt: string, details: Record<string, any> = {}): DriftMetric {
  return {
    _type: 'driftMetric',
    _id: `driftMetric.${metricType}.${observedAt.slice(0, 10)}`,
    metricId: `${metricType}.${observedAt.slice(0, 10)}`,
    metricType,
    observedAt,
    windowStart: new Date(new Date(observedAt).getTime() - (24 * 60 * 60 * 1000)).toISOString(),
    windowEnd: observedAt,
    value: round(value),
    baseline: null as any,
    severity: deriveSeverity(metricType, value),
    details,
  };
}

function computeStaleEvidencePercentage(candidates: any[], now: string): number {
  if (candidates.length === 0) return 0;
  const staleCount = candidates.filter((candidate) => {
    const staleAfter = candidate.staleAfter || candidate.expirationTime;
    return staleAfter ? new Date(staleAfter).getTime() <= new Date(now).getTime() : false;
  }).length;
  return staleCount / candidates.length;
}

function computeDuplicateActionRate(candidates: any[]): number {
  if (candidates.length === 0) return 0;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const candidate of candidates) {
    const key = [candidate.account?._ref || 'none', candidate.person?._ref || 'none', candidate.actionType, candidate.patternMatch || 'none'].join('|');
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates / candidates.length;
}

function computeWeakDraftRate(drafts: any[]): number {
  if (drafts.length === 0) return 0;
  const weak = drafts.filter((draft) => String(draft.body || '').trim().length < 80).length;
  return weak / drafts.length;
}

function computeSignalToActionConversion(signals: any[], candidates: any[]): number {
  if (signals.length === 0) return 0;
  return candidates.length / signals.length;
}

function duplicationFrequency(signals: SignalEvent[]): number {
  if (signals.length === 0) return 0;
  const seen = new Set<string>();
  let dupes = 0;
  for (const signal of signals) {
    const key = signal.dedupeKey || signal._id;
    if (seen.has(key)) dupes += 1;
    seen.add(key);
  }
  return dupes / signals.length;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
}

function deriveSeverity(metricType: DriftMetric['metricType'], value: number): DriftMetric['severity'] {
  if (metricType === 'duplicate_action_rate' || metricType === 'stale_evidence_percentage' || metricType === 'weak_draft_rate') {
    if (value >= 0.35) return 'high';
    if (value >= 0.15) return 'medium';
    return 'low';
  }
  if (metricType === 'score_inflation') {
    if (value >= 85) return 'high';
    if (value >= 70) return 'medium';
    return 'low';
  }
  return value >= 0.6 ? 'medium' : 'low';
}

function round(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
