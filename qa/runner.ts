import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from '@playwright/test';
import { attachDiagnostics, createDiagnostics, inspectCommonIssues } from './diagnostics.ts';
import { attemptRepair } from './repair-engine.ts';
import { ensureDir, sanitize, writeJson, writeText } from './utils.ts';
import type { QAContext, QAItemResult, QAReport } from './types.ts';
import { runOverviewFlow } from './flows/overview.flow.ts';
import { runAccountsFlow } from './flows/accounts.flow.ts';
import { runAccountDetailFlow } from './flows/account-detail.flow.ts';
import { runPeopleFlow } from './flows/people.flow.ts';
import { runSignalsFlow } from './flows/signals.flow.ts';
import { runPatternsFlow } from './flows/patterns.flow.ts';
import { runActionsFlow } from './flows/actions.flow.ts';
import { runResearchFlow } from './flows/research.flow.ts';
import { runJobsFlow } from './flows/jobs.flow.ts';
import { runMetricsFlow } from './flows/metrics.flow.ts';
import { runSystemLabFlow } from './flows/system-lab.flow.ts';
import { runCapabilitiesFlow } from './flows/capabilities.flow.ts';
import { runSignupSignalScenario } from './scenarios/signup-signal.scenario.ts';
import { runCmsDisplacementScenario } from './scenarios/cms-displacement.scenario.ts';
import { runEnrichmentScenario } from './scenarios/enrichment.scenario.ts';
import { runDraftGenerationScenario } from './scenarios/draft-generation.scenario.ts';
import { runOpportunityRankingScenario } from './scenarios/opportunity-ranking.scenario.ts';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const workerUrl = process.env.QA_WORKER_URL || 'http://127.0.0.1:8787';

const flowRunners = [
  runOverviewFlow,
  runAccountsFlow,
  runAccountDetailFlow,
  runPeopleFlow,
  runSignalsFlow,
  runPatternsFlow,
  runActionsFlow,
  runResearchFlow,
  runJobsFlow,
  runMetricsFlow,
  runSystemLabFlow,
  runCapabilitiesFlow,
];

const scenarioRunners = [
  runSignupSignalScenario,
  runCmsDisplacementScenario,
  runEnrichmentScenario,
  runDraftGenerationScenario,
  runOpportunityRankingScenario,
];

async function main() {
  const startedAt = new Date();
  const runId = `run-${startedAt.toISOString().replace(/[:.]/g, '-')}`;
  const reportDir = path.join(process.cwd(), 'qa', 'reports', runId);
  const screenshotsDir = path.join(reportDir, 'screenshots');
  const logsDir = path.join(reportDir, 'logs');
  await ensureDir(screenshotsDir);
  await ensureDir(logsDir);

  const managedProcesses = await ensureAppsRunning(logsDir);
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  await browserContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await browserContext.newPage();
  const diagnostics = createDiagnostics();
  attachDiagnostics(page, diagnostics);
  const ctx: QAContext = {
    page,
    browserContext,
    baseUrl,
    reportDir,
    screenshotsDir,
    logsDir,
    runId,
    diagnostics,
    notes: [],
  };

  const repairLog: QAReport['repairLog'] = [];
  const flowResults = await runItems(flowRunners, ctx, repairLog);
  const scenarioResults = await runItems(scenarioRunners, ctx, repairLog);
  await inspectCommonIssues(page, diagnostics);

  const tracePath = path.join(reportDir, 'trace.zip');
  await browserContext.tracing.stop({ path: tracePath });
  await browser.close();
  await Promise.all(managedProcesses.map((proc) => stopProcess(proc)));

  const report: QAReport = {
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    systemReliabilityScore: computeReliability(flowResults, scenarioResults, repairLog),
    flowResults,
    scenarioResults,
    diagnostics,
    repairLog,
  };

  await writeJson(path.join(reportDir, 'summary.json'), report);
  await writeText(path.join(reportDir, 'report.html'), renderHtmlReport(report));
  await writeJson(path.join(logsDir, 'diagnostics.json'), diagnostics);

  console.log(JSON.stringify({
    runId: report.runId,
    systemReliabilityScore: report.systemReliabilityScore,
    flowPasses: flowResults.filter((item) => item.status !== 'failed').length,
    scenarioPasses: scenarioResults.filter((item) => item.status !== 'failed').length,
    reportDir,
  }, null, 2));
}

async function runItems(
  runners: Array<(ctx: QAContext) => Promise<QAItemResult>>,
  ctx: QAContext,
  repairLog: QAReport['repairLog'],
) {
  const results: QAItemResult[] = [];
  await ctx.page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  for (const runItem of runners) {
    await dismissPendingConfirmation(ctx);
    let result = await runItem(ctx);
    if (result.status === 'failed' && result.failures[0]) {
      const repair = await attemptRepair(ctx, result.failures[0]);
      repairLog.push(repair);
      await dismissPendingConfirmation(ctx);
      const rerun = await runItem(ctx);
      if (rerun.status !== 'failed') {
        result = { ...rerun, status: 'repaired', confidenceScore: Math.min(100, rerun.confidenceScore + 8) };
      } else {
        result = rerun;
      }
    }
    results.push(result);
  }
  return results;
}

async function dismissPendingConfirmation(ctx: QAContext) {
  const cancel = ctx.page.getByRole('button', { name: /cancel/i });
  if (await cancel.count()) {
    await cancel.first().click().catch(() => null);
  }
}

async function ensureAppsRunning(logsDir: string) {
  const processes: ChildProcess[] = [];
  if (!(await isHealthy(`${workerUrl}/health`))) {
    processes.push(startProcess('npm run dev', process.cwd(), path.join(logsDir, 'worker.log')));
    await waitForHealth(`${workerUrl}/health`, 120000);
  }
  if (!(await isHealthy(baseUrl))) {
    processes.push(startProcess('npm run console:dev', process.cwd(), path.join(logsDir, 'console.log')));
    await waitForHealth(baseUrl, 120000);
  }
  return processes;
}

function startProcess(command: string, cwd: string, logPath: string) {
  const child = spawn(command, { cwd, shell: true, env: process.env });
  const stream = createWriteStream(logPath, { flags: 'a' });
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
  return child;
}

async function stopProcess(child: ChildProcess) {
  if (!child.pid) return;
  child.kill('SIGTERM');
}

async function isHealthy(url: string) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isHealthy(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function computeReliability(flowResults: QAItemResult[], scenarioResults: QAItemResult[], repairLog: QAReport['repairLog']) {
  const all = [...flowResults, ...scenarioResults];
  const passRate = all.length ? all.filter((item) => item.status !== 'failed').length / all.length : 0;
  const avgConfidence = all.length ? all.reduce((sum, item) => sum + item.confidenceScore, 0) / all.length : 0;
  const repairRate = repairLog.length ? repairLog.filter((item) => item.outcome === 'succeeded').length / repairLog.length : 1;
  return Math.round((passRate * 45) + (avgConfidence * 0.45) + (repairRate * 10));
}

function renderHtmlReport(report: QAReport) {
  const renderItems = (items: QAItemResult[]) => items.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>${item.status}</td>
      <td>${item.confidenceScore}</td>
      <td>${item.failures.map((failure) => failure.message).join('<br/>') || '&mdash;'}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html><head><meta charset="utf-8"/><title>QA Report ${report.runId}</title>
  <style>body{font-family:Inter,system-ui,sans-serif;background:#0f1115;color:#e5e7eb;padding:24px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #2a2f3a;padding:8px;text-align:left}.muted{color:#9ca3af}</style>
  </head><body>
    <h1>System QA Report</h1>
    <p class="muted">Run ${report.runId} • Reliability ${report.systemReliabilityScore}/100</p>
    <h2>Flows</h2>
    <table><thead><tr><th>ID</th><th>Status</th><th>Confidence</th><th>Issues</th></tr></thead><tbody>${renderItems(report.flowResults)}</tbody></table>
    <h2>Scenarios</h2>
    <table><thead><tr><th>ID</th><th>Status</th><th>Confidence</th><th>Issues</th></tr></thead><tbody>${renderItems(report.scenarioResults)}</tbody></table>
    <h2>Diagnostics</h2>
    <pre>${escapeHtml(JSON.stringify(report.diagnostics, null, 2))}</pre>
    <h2>Repairs</h2>
    <pre>${escapeHtml(JSON.stringify(report.repairLog, null, 2))}</pre>
  </body></html>`;
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

main().catch(async (error) => {
  const fallbackDir = path.join(process.cwd(), 'qa', 'reports');
  await ensureDir(fallbackDir);
  await writeFile(path.join(fallbackDir, `runner-error-${sanitize(new Date().toISOString())}.log`), String(error?.stack || error), 'utf8');
  console.error(error);
  process.exitCode = 1;
});
