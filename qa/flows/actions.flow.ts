import type { QAContext } from '../types.ts';
import { runSectionFlow } from './shared.ts';

export async function runActionsFlow(ctx: QAContext) {
  return runSectionFlow({ id: 'actions', sectionLabel: 'Actions', expectedHeading: /Today's Actions|Action Queue|TOP ACTIONS TODAY|The most important page/i, ctx });
}
