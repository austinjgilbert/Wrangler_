import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runResearchFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'research', sectionLabel: 'Research', expectedHeading: /Research Console|Recent research runs|Research/i, ctx, commandToTry: 'queue research fleetfeet.com' });
}
