import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runSignalsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'signals', sectionLabel: 'Signals', expectedHeading: /Signal Monitoring|Recent Signals/i, ctx });
}
