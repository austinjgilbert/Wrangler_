#!/usr/bin/env node
/**
 * Minimal system test harness.
 * Validates that required files and route strings exist.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/index.js',
  'src/routes/molt.ts',
  'src/routes/dq.ts',
  'src/routes/enrich.ts',
  'src/routes/calls.ts',
  'src/routes/network.ts',
  'src/routes/opportunities.ts',
  'src/lib/toolRegistry.ts',
  'src/lib/toolClient.ts',
  'src/lib/riskEngine.ts',
  'src/lib/entityResolver.ts',
  'src/lib/jobs.ts',
  'src/lib/dqRules.ts',
  'src/lib/crawler.ts',
  'src/lib/robots.ts',
  'src/lib/extractors.ts',
  'src/lib/proposals.ts',
  'src/lib/patterns.ts',
  'src/lib/briefing.ts',
  'src/lib/callCoaching.ts',
  'src/lib/callInsight.ts',
  'src/lib/notify.ts',
];

const missing = requiredFiles.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length > 0) {
  console.error('Missing required files:', missing);
  process.exit(1);
}

const indexPath = path.join(root, 'src/index.js');
const indexText = fs.readFileSync(indexPath, 'utf8');
const requiredRoutes = [
  '/molt/run',
  '/molt/log',
  '/molt/jobs/run',
  '/dq/scan',
  '/enrich/run',
  '/calls/ingest',
  '/network/dailyRun',
  '/opportunities/daily',
];

const missingRoutes = requiredRoutes.filter((r) => !indexText.includes(r));
if (missingRoutes.length > 0) {
  console.error('Missing required routes:', missingRoutes);
  process.exit(1);
}

console.log('System test passed: core files and routes present.');
