import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runJobsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'jobs', sectionLabel: 'Jobs', expectedHeading: /Job Control Center|Recent Jobs|Jobs/i, ctx });
}
