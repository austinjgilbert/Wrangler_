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

export function transformBriefingResponse(raw: {
  ok: boolean;
  data: RawGoodMorningResponse;
}): TransformedBriefing {
  const data = raw.data;
  const topAccounts = data.top10Accounts ?? [];
  const enrichedAccounts = topAccounts.map(toBriefingAccount);

  const scores = enrichedAccounts.map(a => a.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 0;
  const hotAccounts = enrichedAccounts.filter(a => a.urgency === 'urgent').length;

  let winCondition = 'Build pipeline momentum';
  if (hotAccounts >= 3) winCondition = `${hotAccounts} hot accounts — prioritize outreach`;
  else if (avgScore >= 70) winCondition = 'Strong pipeline — close the gaps';

  return {
    enrichedAccounts,
    emailQueue: data.emailQueue ?? [],
    linkedInQueue: data.linkedInQueue ?? [],
    callList: data.callList ?? [],
    stats: {
      totalAccounts: enrichedAccounts.length,
      hotAccounts,
      avgScore,
      winCondition,
    },
    assumptionRefresh: data.assumptionRefresh ?? null,
  };
}
