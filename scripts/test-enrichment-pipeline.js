#!/usr/bin/env node
/**
 * Test auto-enrichment pipeline for Trilliant (and optionally other domains).
 * Usage: BASE_URL=https://website-scanner.<subdomain>.workers.dev node scripts/test-enrichment-pipeline.js
 *        Or with local dev: npm run dev (in one terminal), then node scripts/test-enrichment-pipeline.js
 */

const BASE = process.env.BASE_URL || 'http://localhost:8787';

async function fetchJson(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const domains = ['trillianthealth.com'];
  console.log('Testing auto-enrichment pipeline against', BASE);

  // 1) Trigger context for each domain (queues enrichment if account exists and not enriched)
  for (const domain of domains) {
    try {
      const ctx = await fetchJson(`/query?type=context&domain=${encodeURIComponent(domain)}`);
      console.log(`[${domain}] context:`, ctx.ok ? 'OK' : ctx.error || ctx);
    } catch (e) {
      console.log(`[${domain}] context error:`, e.message);
    }
  }

  // 2) Optionally queue explicitly (ensures job is queued even if context didn't)
  for (const domain of domains) {
    try {
      const canonicalUrl = `https://${domain}`;
      const queue = await fetchJson('/enrich/queue', {
        method: 'POST',
        body: JSON.stringify({ canonicalUrl, url: canonicalUrl }),
      });
      console.log(`[${domain}] queue:`, queue);
    } catch (e) {
      console.log(`[${domain}] queue error:`, e.message);
    }
  }

  // 3) Process pending enrichment jobs (what cron does every 15 min)
  try {
    const processRes = await fetchJson('/enrich/process', { method: 'POST' });
    console.log('enrich/process:', processRes);
  } catch (e) {
    console.log('enrich/process error:', e.message);
  }

  // 4) List enrichment jobs (any account)
  try {
    const jobsRes = await fetchJson('/enrich/jobs?limit=20');
    console.log('enrich/jobs:', jobsRes);
    if (jobsRes.jobs?.length) {
      const first = jobsRes.jobs[0];
      const statusRes = await fetchJson(`/enrich/status?accountKey=${encodeURIComponent(first.accountKey)}`);
      console.log('enrich/status (first job):', statusRes);
    }
  } catch (e) {
    console.log('enrich/jobs or status error:', e.message);
  }

  console.log('Done. Check Sanity for accountPack researchSet and account brief data.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
