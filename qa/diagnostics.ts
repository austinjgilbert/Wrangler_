import type { Page, Response } from '@playwright/test';
import type { QADiagnostics } from './types.ts';

export function createDiagnostics(): QADiagnostics {
  return {
    consoleErrors: [],
    networkFailures: [],
    pageErrors: [],
    stuckIndicators: [],
    emptyStates: [],
  };
}

export function attachDiagnostics(page: Page, diagnostics: QADiagnostics) {
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('response', (response: Response) => {
    if (response.status() >= 400) {
      diagnostics.networkFailures.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
      });
    }
  });
}

export async function inspectCommonIssues(page: Page, diagnostics: QADiagnostics) {
  const emptyTexts = [
    'No accounts match your current filters.',
    'No action candidates are ready right now.',
    'No drift alerts currently detected.',
  ];
  for (const text of emptyTexts) {
    if (await page.getByText(text, { exact: false }).count()) {
      diagnostics.emptyStates.push(text);
    }
  }
  if (await page.getByText(/Running:/i).count()) {
    diagnostics.stuckIndicators.push('command-running-indicator-visible');
  }
}
