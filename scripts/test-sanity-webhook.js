#!/usr/bin/env node
/**
 * Test POST /webhooks/sanity (Sanity webhook endpoint).
 * Loads BASE_URL and SANITY_WEBHOOK_SECRET from .dev.vars if present.
 *
 * Usage (from project root):
 *   node scripts/test-sanity-webhook.js [baseUrl]
 *
 * Examples:
 *   node scripts/test-sanity-webhook.js
 *   node scripts/test-sanity-webhook.js http://localhost:8787
 *   node scripts/test-sanity-webhook.js https://website-scanner.austin-gilbert.workers.dev
 *
 * If SANITY_WEBHOOK_SECRET is set, the request includes the sanity-webhook-signature header.
 * Otherwise the worker must have no secret configured (or it will return 401).
 */

import { readFileSync, existsSync } from 'fs';
import { createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function loadDevVars() {
  const path = join(rootDir, '.dev.vars');
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

const env = { ...process.env, ...loadDevVars() };
const baseUrl = (process.argv[2] || env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const secret = env.SANITY_WEBHOOK_SECRET || '';

// Minimal payload that triggers account handler (will skip enrichment if no real gaps)
const payload = {
  _id: 'test-webhook-doc',
  _type: 'account',
  accountKey: 'test.example.com',
  domain: 'test.example.com',
  rootDomain: 'example.com',
  profileCompleteness: { score: 10, gaps: ['company'], nextStages: ['enrich'] },
};

const body = JSON.stringify(payload);
const headers = {
  'Content-Type': 'application/json',
};

if (secret) {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  headers['sanity-webhook-signature'] = sig;
}

const url = `${baseUrl}/webhooks/sanity`;
console.log('POST', url);
if (secret) console.log('(signature included)');
else console.log('(no SANITY_WEBHOOK_SECRET — worker must have no secret or request will 401)');
console.log('');

const res = await fetch(url, {
  method: 'POST',
  headers,
  body,
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = null;
}

console.log('Status:', res.status, res.statusText);
console.log('Response:', json ? JSON.stringify(json, null, 2) : text);

if (!res.ok) {
  process.exit(1);
}
