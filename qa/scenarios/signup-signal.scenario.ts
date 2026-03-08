import type { QAContext } from '../types.ts';
import { runCommandScenario } from './shared.ts';

export async function runSignupSignalScenario(ctx: QAContext) {
  return runCommandScenario({
    id: 'signup-signal',
    ctx,
    commands: ['simulate signup-immediate-action', 'generate sdr actions'],
    expectedTexts: [/TOP ACTIONS TODAY|Today's Actions|Action Queue/i],
  });
}
