import type { QAContext } from '../types.ts';
import { runCommandScenario } from './shared.ts';

export async function runEnrichmentScenario(ctx: QAContext) {
  return runCommandScenario({
    id: 'enrichment',
    ctx,
    commands: ['refresh stale entities', 'queue anti drift maintenance'],
    expectedTexts: [/Confirmation required|System Lab|Command Result|Running:/i],
  });
}
