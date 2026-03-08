import type { QAContext } from '../types.ts';
import { runCommandScenario } from './shared.ts';

export async function runOpportunityRankingScenario(ctx: QAContext) {
  return runCommandScenario({
    id: 'opportunity-ranking',
    ctx,
    commands: ['recalculate scores', 'generate sdr actions'],
    expectedTexts: [/Confirmation required|TOP ACTIONS TODAY|Action Queue/i],
  });
}
