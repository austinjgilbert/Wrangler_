import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runAccountsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'accounts', sectionLabel: 'Accounts', expectedHeading: /Account Explorer|account/i, ctx, commandToTry: 'scan nike.com' });
}
