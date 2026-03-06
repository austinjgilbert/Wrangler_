/**
 * Smoke test runner (plain JS). Loads .dev.vars from project root, then runs smoke steps.
 * Usage: npm run smoke-test   or   node scripts/smoke-test.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const devVarsPath = join(root, '.dev.vars');
if (existsSync(devVarsPath)) {
  const content = readFileSync(devVarsPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  });
}

// Default to production so "npm run smoke-test" works without a local worker
const BASE_URL = process.env.BASE_URL || 'https://website-scanner.austin-gilbert.workers.dev';
const moltApiKey = process.env.MOLT_API_KEY || process.env.CHATGPT_API_KEY;
const projectId = process.env.SANITY_PROJECT_ID;

if (!moltApiKey && BASE_URL.includes('workers.dev')) {
  console.warn('Hint: MOLT_API_KEY not set. Set it in .dev.vars or run: wrangler secret put MOLT_API_KEY --env production');
}
const dataset = process.env.SANITY_DATASET || 'production';
const token = process.env.SANITY_TOKEN || process.env.SANITY_API_TOKEN;
const apiVersion = process.env.SANITY_API_VERSION || '2023-10-01';

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_TOKEN (set in .dev.vars or env)');
  process.exit(1);
}

const sanityBase = `https://${projectId}.api.sanity.io/v${apiVersion}`;
const queryUrl = `${sanityBase}/data/query/${dataset}`;
const mutateUrl = `${sanityBase}/data/mutate/${dataset}`;

async function sanityFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sanity error ${response.status}: ${text}`);
  }
  return response.json();
}

async function workerPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (moltApiKey) headers['Authorization'] = `Bearer ${moltApiKey}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Worker ${path} error ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function run() {
  console.log('1) /molt/log');
  const logRes = await workerPost('/molt/log', {
    text: 'Smoke test event: sent follow-up',
    channel: 'system',
    entityHints: ['TestCo'],
    outcome: 'pending',
  });
  const eventId = logRes?.data?.eventId;
  const requestId = logRes?.requestId;
  if (!eventId) throw new Error('Missing eventId from /molt/log');

  console.log('2) Verify molt.event');
  const eventQuery = encodeURIComponent(`*[_type == "molt.event" && _id == "${eventId}"][0]`);
  const eventResult = await sanityFetch(`${queryUrl}?query=${eventQuery}`);
  if (!eventResult?.result?._id) throw new Error('molt.event not found in Sanity');

  console.log('3) Verify molt.job queued');
  const jobQuery = encodeURIComponent(`*[_type == "molt.job" && traceId == "${requestId}"]`);
  const jobResult = await sanityFetch(`${queryUrl}?query=${jobQuery}`);
  if (!Array.isArray(jobResult?.result) || jobResult.result.length === 0) {
    console.warn('No molt.job found for traceId (may be expected if jobs disabled).');
  }

  console.log('4) /enrich/run (no-op ok)');
  await workerPost('/enrich/run', {});

  console.log('5) /calls/ingest');
  const callRes = await workerPost('/calls/ingest', {
    transcript: '00:01 Austin: Quick test. 00:05 Prospect: Sounds good.',
    meetingType: 'test',
    accountHint: 'TestCo',
    peopleHints: ['Test Person'],
    objectives: ['Test'],
  });
  const { sessionId, coachingId, followupDraftId } = callRes?.data || {};
  if (!sessionId || !coachingId || !followupDraftId) {
    throw new Error('calls/ingest missing expected IDs');
  }

  console.log('6) Verify call.coaching and call.followupDraft');
  const coachingQuery = encodeURIComponent(`*[_type == "call.coaching" && _id == "${coachingId}"][0]`);
  const followupQuery = encodeURIComponent(`*[_type == "call.followupDraft" && _id == "${followupDraftId}"][0]`);
  const coachingResult = await sanityFetch(`${queryUrl}?query=${coachingQuery}`);
  const followupResult = await sanityFetch(`${queryUrl}?query=${followupQuery}`);
  if (!coachingResult?.result?._id) throw new Error('call.coaching not found');
  if (!followupResult?.result?._id) throw new Error('call.followupDraft not found');

  console.log('7) Seed network person + company for daily run');
  const companyId = `company.test.${Date.now()}`;
  const personId = `networkPerson.test.${Date.now()}`;
  await fetch(mutateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mutations: [
        {
          createIfNotExists: {
            _type: 'company',
            _id: companyId,
            name: 'TestCo',
            domain: 'example.com',
            newsroomRssUrls: ['https://example.com/rss'],
            careersUrls: [],
            tags: ['test'],
          },
        },
        {
          createIfNotExists: {
            _type: 'networkPerson',
            _id: personId,
            name: 'Test Person',
            company: 'TestCo',
            title: 'Director',
            linkedinUrl: 'https://linkedin.com/in/test',
            tier: 'A',
            relationshipStrength: 5,
            tags: ['test'],
          },
        },
      ],
    }),
  }).then((r) => (r.ok ? r.json() : r.text().then((t) => { throw new Error(`Sanity mutate ${r.status}: ${t}`); })));

  console.log('8) /network/dailyRun');
  await workerPost('/network/dailyRun', {});
  const starterQuery = encodeURIComponent(`*[_type == "conversationStarter" && personRef._ref == "${personId}"]`);
  const starterResult = await sanityFetch(`${queryUrl}?query=${starterQuery}`);
  if (!Array.isArray(starterResult?.result) || starterResult.result.length === 0) {
    console.warn('No conversationStarter found; check tool config or data sources.');
  }

  console.log('9) /wrangler/ingest');
  const wranglerRes = await workerPost('/wrangler/ingest', {
    userPrompt: 'Draft a follow-up to Jane.',
    gptResponse: 'Here is a short draft response.',
    sessionId: null,
    referencedAccounts: ['TestCo'],
    referencedPeople: ['Test Person'],
    contextTags: ['followup'],
  });
  if (!wranglerRes?.data?.interactionId) {
    throw new Error('wrangler/ingest missing interactionId');
  }

  console.log('Smoke test completed.');
}

run().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('Smoke test failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
