import type { ConsoleSnapshot, OutcomeRecord, OutcomeFunnel } from '@/lib/types';

/**
 * Derives outcome records and funnel from snapshot.
 * In production would come from CRM/sales pipeline integration.
 */
export function getOutcomeRecordsFromSnapshot(snapshot: ConsoleSnapshot): OutcomeRecord[] {
  const records: OutcomeRecord[] = [];
  const now = new Date().toISOString();
  const radar = snapshot.overview.opportunityRadar;
  const signals = snapshot.overview.signalTimeline;

  signals.slice(0, 20).forEach((s) => {
    records.push({
      id: `out-${s.id}`,
      accountId: s.accountId,
      accountName: s.accountName,
      outcomeType: 'signal',
      sourceId: s.id,
      at: s.timestamp,
    });
  });

  // Mock reply/meeting/pipeline from high-confidence radar items (simulated closed loop)
  radar.filter((r) => r.confidence >= 70).slice(0, 5).forEach((r, i) => {
    const base = new Date(now).getTime() - (i + 1) * 86400 * 1000;
    records.push({
      id: `reply-${r.actionCandidateId}`,
      accountId: r.accountId,
      accountName: r.accountName,
      outcomeType: 'reply',
      at: new Date(base).toISOString(),
    });
    if (i < 2) {
      records.push({
        id: `meeting-${r.actionCandidateId}`,
        accountId: r.accountId,
        accountName: r.accountName,
        outcomeType: 'meeting',
        at: new Date(base + 3600 * 1000).toISOString(),
      });
    }
    if (i === 0) {
      records.push({
        id: `pipe-${r.actionCandidateId}`,
        accountId: r.accountId,
        accountName: r.accountName,
        outcomeType: 'pipeline',
        value: 15000,
        at: new Date(base + 86400 * 1000).toISOString(),
      });
    }
  });

  return records.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function getOutcomeFunnelFromSnapshot(snapshot: ConsoleSnapshot): OutcomeFunnel {
  const records = getOutcomeRecordsFromSnapshot(snapshot);
  const signals = records.filter((r) => r.outcomeType === 'signal').length;
  const replies = records.filter((r) => r.outcomeType === 'reply').length;
  const meetings = records.filter((r) => r.outcomeType === 'meeting').length;
  const pipelineValue = records.filter((r) => r.outcomeType === 'pipeline').reduce((s, r) => s + (r.value ?? 0), 0);
  return {
    period: 'Last 30 days',
    signals,
    replies,
    meetings,
    pipelineValue,
    conversionSignalToReply: signals > 0 ? replies / signals : 0,
    conversionReplyToMeeting: replies > 0 ? meetings / replies : 0,
    conversionMeetingToPipeline: meetings > 0 ? (pipelineValue > 0 ? 1 : 0) : 0,
  };
}
