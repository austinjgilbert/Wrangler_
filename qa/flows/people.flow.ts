import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runPeopleFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'people', sectionLabel: 'People', expectedHeading: /Person Layer|People Explorer/i, ctx });
}
