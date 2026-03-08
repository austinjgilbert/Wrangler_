import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runPatternsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'patterns', sectionLabel: 'Patterns', expectedHeading: /Pattern Intelligence|Patterns/i, ctx, commandToTry: 'preview strategy' });
}
