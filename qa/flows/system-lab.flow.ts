import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runSystemLabFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'system-lab', sectionLabel: 'System Lab', expectedHeading: /System Lab|Autopilot/i, ctx, commandToTry: 'preview strategy' });
}
