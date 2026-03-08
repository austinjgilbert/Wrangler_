import path from 'node:path';
import type { QAContext, QAItemResult } from '../types.ts';
import { captureScreenshot, gotoSection, makeResult, scoreItem, submitCommand } from '../utils.ts';

export async function runSectionFlow(input: {
  id: string;
  sectionLabel: string;
  expectedHeading: RegExp;
  ctx: QAContext;
  commandToTry?: string;
}) {
  const startedAtMs = Date.now();
  const failures = [];
  const warnings: string[] = [];

  try {
    await gotoSection(input.ctx, input.sectionLabel);
    await input.ctx.page.waitForLoadState('domcontentloaded');
    await input.ctx.page.getByText(input.expectedHeading).first().waitFor({ timeout: 7000 });
    if (input.commandToTry) {
      await submitCommand(input.ctx, input.commandToTry);
      warnings.push(`Command executed during ${input.id}: ${input.commandToTry}`);
    }
  } catch (error: any) {
    failures.push({
      id: `${input.id}-failure`,
      scope: 'flow',
      title: `${input.sectionLabel} flow failed`,
      message: error.message,
      severity: 'high',
      category: 'navigation',
      details: { sectionLabel: input.sectionLabel, command: input.commandToTry || null },
    });
  }

  await captureScreenshot(input.ctx.page, path.join(input.ctx.screenshotsDir, `${input.id}.png`));
  return makeResult({
    id: input.id,
    kind: 'flow',
    status: failures.length ? 'failed' : 'passed',
    confidenceScore: scoreItem({ failures: failures.length, warnings: warnings.length, repaired: false }),
    warnings,
    failures,
    metadata: { sectionLabel: input.sectionLabel },
    startedAtMs,
  }) satisfies QAItemResult;
}
