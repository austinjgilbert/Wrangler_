/**
 * heat-map-adapter.ts — Transform briefing data into heat map grid.
 *
 * Data source: /sdr/good-morning → top10Accounts[]
 * Each account gets 4 dimensions: Urgency, Opportunity, Signals, Score.
 * Momentum deferred to Phase 2 (no historical data).
 */

import type { BriefingAccount, TransformedBriefing } from '../../../lib/adapters/types';

export interface HeatMapAccount {
  accountKey: string;
  name: string;
  score: number;        // 0-100
  urgency: number;      // 0-1, derived from bestNextAction
  opportunity: number;  // 0-1, derived from score
  signalCount: number;  // Always 0 in production (no signal docs)
  hot: boolean;
}

export const HEAT_MAP_COLUMNS = ['Urgency', 'Opportunity', 'Signals', 'Score'] as const;

export function deriveHeatMapData(briefing: TransformedBriefing): HeatMapAccount[] {
  return briefing.enrichedAccounts.map((acct: BriefingAccount) => ({
    accountKey: acct.accountKey,
    name: acct.account,
    score: acct.score ?? 0,
    urgency:
      acct.bestNextAction === 'call' ? 0.9
        : acct.bestNextAction === 'linkedin' ? 0.7
          : 0.5,
    opportunity: (acct.score ?? 0) / 100,
    signalCount: 0,
    hot: (acct.score ?? 0) > 75,
  }));
}

/**
 * Get cell value (0-1) for a given account and column index.
 */
export function getCellValue(account: HeatMapAccount, colIndex: number): number {
  switch (colIndex) {
    case 0: return account.urgency;
    case 1: return account.opportunity;
    case 2: return Math.min(1, account.signalCount / 5);
    case 3: return account.score / 100;
    default: return 0;
  }
}
