import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runMetricsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'metrics', sectionLabel: 'Metrics', expectedHeading: /Metrics|Drift Monitoring/i, ctx });
}
