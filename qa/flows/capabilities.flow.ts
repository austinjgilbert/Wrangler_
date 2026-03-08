import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runCapabilitiesFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'capabilities', sectionLabel: 'Capabilities', expectedHeading: /Function \+ Agent Registry|Capabilities/i, ctx });
}
