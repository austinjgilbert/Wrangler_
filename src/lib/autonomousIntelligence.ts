/**
 * Autonomous Intelligence Loop
 *
 * Orchestrates the 15-min intelligence cycle:
 * 1. Run signal correlation to detect clusters
 * 2. Auto-queue OSINT research for high-priority accounts
 * 3. Push notifications to Telegram when significant changes detected
 *
 * This replaces the passive "wait for operator" model with proactive discovery.
 */

import { runSignalCorrelation } from './signalCorrelator.ts';
import type { CorrelationResult } from './signalCorrelator.ts';
import { createMoltJob, fetchDocumentsByType, createMetricSnapshot } from './sanity.ts';

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_AUTO_RESEARCH_DAILY = 10;
const RESEARCH_COOLDOWN_HOURS = 24; // Don't re-research an account within 24h
const TELEGRAM_API = 'https://api.telegram.org/bot';

// ─── Telegram Push ──────────────────────────────────────────────────────────

async function pushToTelegram(env: any, message: string): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const resp = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Auto-Research Queuing ──────────────────────────────────────────────────

async function getRecentResearchJobs(env: any): Promise<Set<string>> {
  // Fetch OSINT/research jobs from last 24 hours to avoid duplicates
  const jobs = await fetchDocumentsByType(env, 'molt.job', 100).catch(() => []);
  const cutoff = new Date(Date.now() - RESEARCH_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const recentDomains = new Set<string>();

  for (const job of jobs) {
    if ((job.jobType === 'osint' || job.jobType === 'enrich.account') && job.createdAt > cutoff) {
      // Extract domain from inputRefs or payload
      const domain = job.payload?.domain || job.payload?.url || '';
      if (domain) recentDomains.add(domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''));
    }
  }

  return recentDomains;
}

async function queueAutoResearch(
  env: any,
  candidates: CorrelationResult['autoResearchCandidates'],
): Promise<Array<{ accountName: string; domain: string; jobId: string }>> {
  const queued: Array<{ accountName: string; domain: string; jobId: string }> = [];
  const recentDomains = await getRecentResearchJobs(env);
  let dailyCount = recentDomains.size;

  for (const candidate of candidates) {
    if (dailyCount >= MAX_AUTO_RESEARCH_DAILY) break;
    if (!candidate.domain) continue;

    const normalizedDomain = candidate.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (recentDomains.has(normalizedDomain)) continue;

    const now = new Date().toISOString();
    const jobId = `molt.job.auto-research.${normalizedDomain.replace(/[^a-zA-Z0-9.-]/g, '-')}.${Date.now()}`;

    await createMoltJob(env, {
      _type: 'molt.job',
      _id: jobId,
      jobType: 'auto-research',
      status: 'queued',
      priority: 60,
      attempts: 0,
      maxAttempts: 2,
      nextAttemptAt: now,
      leaseExpiresAt: null,
      traceId: null,
      idempotencyKey: `auto-research.${normalizedDomain}.${now.slice(0, 13)}`,
      inputRefs: [{ _type: 'reference', _ref: candidate.accountId }],
      outputRefs: [],
      payload: {
        domain: normalizedDomain,
        accountId: candidate.accountId,
        accountName: candidate.accountName,
        reason: candidate.reason,
        trigger: 'signal_correlation',
      },
      error: null,
      createdAt: now,
      updatedAt: now,
    }).catch(() => null);

    queued.push({ accountName: candidate.accountName, domain: normalizedDomain, jobId });
    dailyCount++;
  }

  return queued;
}

// ─── Morning Briefing ───────────────────────────────────────────────────────

function formatMorningBrief(result: CorrelationResult, researchQueued: Array<{ accountName: string; domain: string }>): string {
  const lines: string[] = [];
  lines.push('<b>🔍 Wrangler Intelligence Update</b>\n');

  if (result.compoundSignals.length === 0 && researchQueued.length === 0) {
    lines.push('No significant signal clusters detected. System is monitoring.');
    return lines.join('\n');
  }

  // Top compound signals
  const top = result.compoundSignals.slice(0, 3);
  if (top.length > 0) {
    lines.push(`<b>${top.length} signal cluster(s) detected:</b>\n`);
    for (let i = 0; i < top.length; i++) {
      const cs = top[i];
      const strengthPct = Math.round(cs.strength * 100);
      lines.push(`${i + 1}. <b>${cs.clusterType.split(':').pop()}</b> (${strengthPct}% strength, ${cs.signalCount} signals)`);
      lines.push(`   ${cs.accountNames.slice(0, 4).join(', ')}${cs.accountNames.length > 4 ? ` +${cs.accountNames.length - 4} more` : ''}`);
      lines.push('');
    }
  }

  // Auto-research
  if (researchQueued.length > 0) {
    lines.push(`<b>📡 Auto-queued research on ${researchQueued.length} account(s):</b>`);
    for (const r of researchQueued) {
      lines.push(`  • ${r.accountName} (${r.domain})`);
    }
    lines.push('');
  }

  // LLM summary
  if (result.summary) {
    lines.push(`<i>${result.summary}</i>`);
  }

  return lines.join('\n');
}

// ─── Main Autonomous Loop ───────────────────────────────────────────────────

export interface AutonomousIntelligenceResult {
  correlation: CorrelationResult;
  researchQueued: Array<{ accountName: string; domain: string; jobId: string }>;
  telegramSent: boolean;
  ranAt: string;
}

export async function runAutonomousIntelligenceCycle(env: any): Promise<AutonomousIntelligenceResult> {
  const ranAt = new Date().toISOString();

  // Step 1: Correlate signals
  const correlation = await runSignalCorrelation(env);

  // Step 2: Auto-queue research for high-priority accounts
  const researchQueued = await queueAutoResearch(env, correlation.autoResearchCandidates);

  // Step 3: Push to Telegram if anything significant was found
  let telegramSent = false;
  const hasSignificant = correlation.compoundSignals.some(cs => cs.strength >= 0.6) || researchQueued.length > 0;

  if (hasSignificant) {
    const briefMessage = formatMorningBrief(correlation, researchQueued);
    telegramSent = await pushToTelegram(env, briefMessage);
  }

  // Step 4: Persist a metric snapshot
  await createMetricSnapshot(env, {
    _type: 'molt.metricSnapshot',
    _id: `molt.metricSnapshot.intelligence.${ranAt.slice(0, 13).replace(/[^a-zA-Z0-9]/g, '-')}`,
    dateRange: { from: ranAt, to: new Date().toISOString() },
    aggregates: {
      compoundSignals: correlation.compoundSignals.length,
      highStrengthClusters: correlation.compoundSignals.filter(cs => cs.strength >= 0.6).length,
      autoResearchQueued: researchQueued.length,
      telegramSent,
    },
    generatedAt: new Date().toISOString(),
  }).catch(() => null);

  return {
    correlation,
    researchQueued,
    telegramSent,
    ranAt,
  };
}

// ─── Morning Briefing (runs daily, richer than the 15-min check) ────────────

export async function generateMorningBriefing(env: any): Promise<{
  message: string;
  telegramSent: boolean;
}> {
  const correlation = await runSignalCorrelation(env);

  // For morning brief, always push even if nothing significant
  const brief = formatMorningBrief(correlation, []);

  // Enhance with top opportunities
  const lines = [brief, ''];

  if (correlation.autoResearchCandidates.length > 0) {
    lines.push('<b>⚡ Top accounts to watch:</b>');
    for (const c of correlation.autoResearchCandidates.slice(0, 5)) {
      lines.push(`  • <b>${c.accountName}</b> (score: ${c.score}) — ${c.reason}`);
    }
  }

  const message = lines.join('\n');
  const telegramSent = await pushToTelegram(env, message);

  return { message, telegramSent };
}
