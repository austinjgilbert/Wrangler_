import type { QAContext } from '../types.ts';
import { runCommandScenario } from './shared.ts';

export async function runDraftGenerationScenario(ctx: QAContext) {
  return runCommandScenario({
    id: 'draft-generation',
    ctx,
    commands: ['generate sdr actions'],
    expectedTexts: [/draft|Action Queue|TOP ACTIONS TODAY/i],
  });
}
