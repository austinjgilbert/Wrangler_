import path from 'node:path';
import type { QAFailure, QAContext } from './types.ts';
import { captureScreenshot, gotoSection, submitCommand } from './utils.ts';

export async function attemptRepair(ctx: QAContext, failure: QAFailure) {
  const strategies: string[] = [];
  let outcome: 'succeeded' | 'failed' | 'skipped' = 'skipped';

  if (failure.category === 'ui') {
    strategies.push('reload-page');
    await ctx.page.reload();
    await ctx.page.waitForLoadState('networkidle');
    outcome = 'succeeded';
  } else if (failure.category === 'navigation') {
    strategies.push('reload-and-renavigate');
    await ctx.page.reload();
    await ctx.page.waitForLoadState('domcontentloaded');
    if (failure.details?.sectionLabel) {
      await gotoSection(ctx, String(failure.details.sectionLabel));
    }
    outcome = 'succeeded';
  } else if (failure.category === 'api') {
    strategies.push('retry-command');
    if (typeof failure.details?.command === 'string') {
      await submitCommand(ctx, String(failure.details.command));
      outcome = 'succeeded';
    } else {
      outcome = 'failed';
    }
  } else if (failure.category === 'job') {
    strategies.push('run-autopilot');
    await submitCommand(ctx, 'run autopilot');
    outcome = 'succeeded';
  } else if (failure.category === 'draft') {
    strategies.push('regenerate-actions');
    await submitCommand(ctx, 'generate sdr actions');
    outcome = 'succeeded';
  }

  const screenshotPath = path.join(ctx.screenshotsDir, `repair-${failure.id}.png`);
  await captureScreenshot(ctx.page, screenshotPath);
  return {
    failureId: failure.id,
    strategy: strategies.join(', ') || 'none',
    outcome,
    screenshotPath,
  };
}
