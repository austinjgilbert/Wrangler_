import type { QAContext } from '../types.ts';
import { runCommandScenario } from './shared.ts';

export async function runCmsDisplacementScenario(ctx: QAContext) {
  return runCommandScenario({
    id: 'cms-displacement',
    ctx,
    commands: ['simulate legacy-cms-displacement', 'preview strategy'],
    expectedTexts: [/legacy|migration|preview/i],
  });
}
