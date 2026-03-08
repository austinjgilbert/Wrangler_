import type { QAContext } from '../types.ts';
import { gotoSection, makeResult, scoreItem } from '../utils.ts';

export async function runAccountDetailFlow(ctx: QAContext) {
  const startedAtMs = Date.now();
  const failures = [];
  try {
    await gotoSection(ctx, 'Accounts');
    const accountButton = ctx.page.getByRole('button', { name: /stripe\.com|nike\.com|fleetfeet\.com/i }).first();
    await accountButton.click();
    await ctx.page.waitForTimeout(500);
    await ctx.page.getByText(/Tech Stack|Signals Timeline|Actions \+ Research/i).first().waitFor({ timeout: 7000 });
  } catch (error: any) {
    failures.push({ id: 'account-detail-failure', scope: 'flow', title: 'Account detail failed', message: error.message, severity: 'high', category: 'ui' } as const);
  }
  return makeResult({ id: 'account-detail', kind: 'flow', status: failures.length ? 'failed' : 'passed', confidenceScore: scoreItem({ failures: failures.length, warnings: 0, repaired: false }), warnings: [], failures, startedAtMs });
}
