import type { BrowserContext, Page } from '@playwright/test';

export type QASeverity = 'low' | 'medium' | 'high' | 'critical';
export type QAStatus = 'passed' | 'failed' | 'warning' | 'repaired';

export type QAFailure = {
  id: string;
  scope: 'flow' | 'scenario' | 'diagnostic' | 'runtime';
  title: string;
  message: string;
  severity: QASeverity;
  category: 'ui' | 'navigation' | 'api' | 'job' | 'draft' | 'data' | 'unknown';
  screenshotPath?: string;
  repairAttempts?: string[];
  details?: Record<string, unknown>;
};

export type QAItemResult = {
  id: string;
  kind: 'flow' | 'scenario';
  status: QAStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  confidenceScore: number;
  warnings: string[];
  failures: QAFailure[];
  metadata?: Record<string, unknown>;
};

export type QADiagnostics = {
  consoleErrors: string[];
  networkFailures: Array<{ url: string; status: number; method: string }>;
  pageErrors: string[];
  stuckIndicators: string[];
  emptyStates: string[];
};

export type QAReport = {
  runId: string;
  startedAt: string;
  completedAt: string;
  systemReliabilityScore: number;
  flowResults: QAItemResult[];
  scenarioResults: QAItemResult[];
  diagnostics: QADiagnostics;
  repairLog: Array<{ failureId: string; strategy: string; outcome: string }>;
};

export type QAContext = {
  page: Page;
  browserContext: BrowserContext;
  baseUrl: string;
  reportDir: string;
  screenshotsDir: string;
  logsDir: string;
  runId: string;
  diagnostics: QADiagnostics;
  notes: string[];
};
