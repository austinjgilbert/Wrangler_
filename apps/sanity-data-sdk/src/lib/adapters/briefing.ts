/**
 * Briefing adapter — transforms raw /sdr/good-morning response into UI types.
 */

import type {
  BriefingAccount,
  TransformedBriefing,
  RawGoodMorningResponse,
  TopAccount,
  Urgency,
  URGENCY_THRESHOLDS,
} from './types';

const THRESHOLDS = { urgent: 80, attention: 60 } as const;

function deriveUrgency(score: number): Urgency {
  if (score >= THRESHOLDS.urgent) return 'urgent';
  if (score >= THRESHOLDS.attention) return 'attention';
  return 'opportunity';
}

function toBriefingAccount(top: TopAccount): BriefingAccount {
  return {
    ...top,
    urgency: deriveUrgency(top.score),
  };
}

export function transformBriefingResponse(data: RawGoodMorningResponse): TransformedBriefing {
  const payload: RawGoodMorningResponse =
    data && typeof data === 'object' && 'data' in (data as any)
      ? (((data as any).data ?? {}) as RawGoodMorningResponse)
      : (data ?? ({} as RawGoodMorningResponse));

  const topAccounts = payload.top10Accounts ?? [];
  const enrichedAccounts = topAccounts.map(toBriefingAccount);

  const scores = enrichedAccounts.map(a => a.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 0;
  const hotAccounts = enrichedAccounts.filter(a => a.urgency === 'urgent').length;

  // Prefer API-generated winCondition (more contextual), fall back to computed
  let winCondition = payload.winCondition || 'Build pipeline momentum';
  if (!payload.winCondition) {
    if (hotAccounts >= 3) winCondition = `${hotAccounts} hot accounts — prioritize outreach`;
    else if (avgScore >= 70) winCondition = 'Strong pipeline — close the gaps';
  }

  return {
    enrichedAccounts,
    emailQueue: payload.emailQueue ?? [],
    linkedInQueue: payload.linkedInQueue ?? [],
    callList: payload.callList ?? [],
    stats: {
      totalAccounts: enrichedAccounts.length,
      hotAccounts,
      avgScore,
      winCondition,
    },
    assumptionRefresh: payload.assumptionRefresh ?? null,
  };
}
