/**
 * Queue Cleanup — Cancel all non-terminal enrichment jobs.
 *
 * Patches enrich.job, enrichmentJob, and orchestrationJob docs
 * where status is NOT done/failed/complete to status: "failed".
 *
 * Run: SANITY_TOKEN=xxx node scripts/clear-queue.mjs [--dry-run]
 *
 * Dry-run is the DEFAULT. Pass --execute to actually mutate.
 */

import { createClient } from '@sanity/client';

const PROJECT_ID = 'nlqb7zmk';
const DATASET = 'production';
const API_VERSION = '2024-01-01';

const EXECUTE = process.argv.includes('--execute');

if (!process.env.SANITY_TOKEN) {
  console.error('FATAL: SANITY_TOKEN environment variable required');
  process.exit(1);
}

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: API_VERSION,
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

const query = `*[
  _type in ["enrich.job", "enrichmentJob", "orchestrationJob"]
  && !(status in ["done", "failed", "complete"])
]{ _id, _type, status, accountKey, goal, createdAt }`;

const jobs = await client.fetch(query);

console.log(`Found ${jobs.length} non-terminal jobs`);
if (jobs.length === 0) {
  console.log('Queue is clean. Nothing to do.');
  process.exit(0);
}

for (const j of jobs) {
  console.log(`  ${j._id}  ${j._type}  status=${j.status}  goal=${j.goal ?? '—'}  created=${j.createdAt?.slice(0, 10) ?? '?'}`);
}

if (!EXECUTE) {
  console.log(`\nDRY RUN — ${jobs.length} jobs would be cancelled.`);
  console.log('Re-run with --execute to apply.');
  process.exit(0);
}

console.log(`\nCancelling ${jobs.length} jobs...`);
let ok = 0;
let err = 0;

for (const j of jobs) {
  try {
    await client.patch(j._id)
      .set({
        status: 'failed',
        cancelledAt: new Date().toISOString(),
        cancelReason: 'manual-queue-clear',
      })
      .commit();
    ok++;
    console.log(`  ✓ ${j._id}`);
  } catch (e) {
    err++;
    console.error(`  ✗ ${j._id} — ${e.message}`);
  }
}

console.log(`\nDone. ${ok} cancelled, ${err} errors.`);
