import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('auto enrichment triggers for company search', async ({ request }) => {
  const sessionId = `session-${Date.now()}`;
  const userId = `test-user-${Date.now()}`;
  const query = 'FullStory.com';

  const searchResponse = await request.post(`${BASE_URL}/search`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Sanity-User-Id': userId,
      'X-Session-Id': sessionId,
    },
    data: { query, limit: 5 },
  });

  expect([200, 503]).toContain(searchResponse.status());
  const searchJson = await searchResponse.json();
  expect(searchJson).toHaveProperty('ok');
  if (searchResponse.status() === 503) {
    expect(searchJson.ok).toBe(false);
    return;
  }
  expect(searchJson.ok).toBe(true);

  let enrichmentJob = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const jobResponse = await request.post(`${BASE_URL}/query`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        query: '*[_type == "enrichmentJob" && canonicalUrl match $domain] | order(updatedAt desc)[0]{jobId,status,updatedAt,accountKey,canonicalUrl,completedStages,failedStages}',
        params: { domain: '*fullstory*' },
      },
    });

    const jobJson = await jobResponse.json();
    const job = jobJson?.data?.documents?.[0] || null;
    if (job) {
      enrichmentJob = job;
      console.log(`[sanity] enrichment job: ${job.jobId} status=${job.status}`);
      break;
    }

    console.log(`[sanity] waiting for enrichment job... attempt ${attempt + 1}`);
    await sleep(2000);
  }

  expect(enrichmentJob).not.toBeNull();

  if (enrichmentJob?.accountKey) {
    const statusResponse = await request.get(`${BASE_URL}/enrich/status?accountKey=${enrichmentJob.accountKey}`);
    const statusJson = await statusResponse.json();
    console.log(`[sanity] enrichment status: ${statusJson?.data?.status?.status || 'unknown'}`);
    expect(statusResponse.ok()).toBeTruthy();
  }
});
