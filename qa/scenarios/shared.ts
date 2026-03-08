import type { QAContext } from '../types.ts';
import { makeResult, scoreItem, submitCommand } from '../utils.ts';

export async function runCommandScenario(input: {
  id: string;
  ctx: QAContext;
  commands: string[];
  expectedTexts: RegExp[];
}) {
  const startedAtMs = Date.now();
  const failures = [];
  for (const command of input.commands) {
    try {
      await submitCommand(input.ctx, command);
      await input.ctx.page.waitForTimeout(500);
    } catch (error: any) {
      failures.push({
        id: `${input.id}-${command}`,
        scope: 'scenario',
        title: `Scenario command failed: ${command}`,
        message: error.message,
        severity: 'high',
        category: 'api',
        details: { command },
      });
    }
  }
  for (const expectedText of input.expectedTexts) {
    try {
      await input.ctx.page.getByText(expectedText).first().waitFor({ timeout: 7000 });
    } catch (error: any) {
      failures.push({
        id: `${input.id}-${expectedText.source}`,
        scope: 'scenario',
        title: `Scenario expectation missing`,
        message: error.message,
        severity: 'medium',
        category: 'data',
      });
    }
  }
  return makeResult({
    id: input.id,
    kind: 'scenario',
    status: failures.length ? 'failed' : 'passed',
    confidenceScore: scoreItem({ failures: failures.length, warnings: 0, repaired: false }),
    warnings: [],
    failures,
    metadata: { commands: input.commands },
    startedAtMs,
  });
}
