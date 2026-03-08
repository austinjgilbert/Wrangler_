import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runOverviewFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'overview', sectionLabel: 'Overview', expectedHeading: /Intelligence Status|Mission control/i, ctx });
}
