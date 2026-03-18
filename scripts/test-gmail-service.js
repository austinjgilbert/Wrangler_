#!/usr/bin/env node
/**
 * Test Gmail service: calls POST /tools/gmail with action "read" (list recent messages).
 * Uses BASE_URL and MOLT_API_KEY from .dev.vars if present.
 *
 * Usage: node scripts/test-gmail-service.js [baseUrl]
 * Example: npm run test:gmail
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
const apiKey = env.MOLT_API_KEY || env.CHATGPT_API_KEY || '';

const url = `${baseUrl}/tools/gmail`;
const body = {
  traceId: `test-gmail-${Date.now()}`,
  tool: 'gmail',
  action: 'read',
  input: { query: '', maxResults: 5 },
};

const headers = {
  'Content-Type': 'application/json',
  ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey } : {}),
};

console.log('POST', url);
console.log('Request: action=read, maxResults=5');
if (apiKey) console.log('(using MOLT_API_KEY from .dev.vars)');
else console.log('(no MOLT_API_KEY; worker may require it for /tools/)');
console.log('');

const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = null;
}

console.log('Status:', res.status, res.statusText);
if (data) {
  if (data.ok && data.data?.output) {
    const { messages, query } = data.data.output;
    console.log('Gmail configured:', data.data.gmailConfigured ?? true);
    console.log('Messages (recent):', Array.isArray(messages) ? messages.length : 0);
    if (Array.isArray(messages) && messages.length > 0) {
      messages.slice(0, 3).forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.subject || '(no subject)'} | from: ${(m.from || '').slice(0, 40)}`);
      });
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
} else {
  console.log(text);
}

if (!res.ok) process.exit(1);
