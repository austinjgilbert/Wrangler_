import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { QAContext, QAItemResult } from './types.ts';

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function writeText(filePath: string, value: string) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, 'utf8');
}

export async function captureScreenshot(page: Page, targetPath: string) {
  await ensureDir(path.dirname(targetPath));
  await page.screenshot({ path: targetPath, fullPage: true });
}

export async function gotoSection(ctx: QAContext, label: string) {
  const sidebar = ctx.page.locator('aside').first();
  const byTitle = sidebar.getByTitle(label);
  if (await byTitle.count()) {
    await byTitle.first().click();
  } else {
    await sidebar.getByRole('button', { name: label, exact: true }).first().click();
  }
  await ctx.page.waitForTimeout(250);
}

export async function submitCommand(ctx: QAContext, command: string) {
  const input = ctx.page.getByPlaceholder(/Search or run command/i);
  await input.fill(command);
  await input.press('Enter');
  await ctx.page.waitForTimeout(500);
}

export function makeResult(input: Omit<QAItemResult, 'startedAt' | 'completedAt' | 'durationMs'> & { startedAtMs: number }) {
  const completedAtMs = Date.now();
  return {
    ...input,
    startedAt: new Date(input.startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - input.startedAtMs,
  } satisfies QAItemResult;
}

export function scoreItem(input: { failures: number; warnings: number; repaired: boolean }) {
  const failurePenalty = input.failures * 28;
  const warningPenalty = input.warnings * 6;
  const repairBonus = input.repaired ? 8 : 0;
  return Math.max(0, Math.min(100, 100 - failurePenalty - warningPenalty + repairBonus));
}

export function sanitize(value: string) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}
