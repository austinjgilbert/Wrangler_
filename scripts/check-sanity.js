#!/usr/bin/env node
/**
 * Verify Sanity CMS connection using the same logic as the worker (/health, /sanity/status).
 * Loads env from .dev.vars if present, then uses src/sanity-client.js.
 *
 * Usage (from project root):
 *   node scripts/check-sanity.js
 *
 * Requires: SANITY_PROJECT_ID and SANITY_TOKEN (or SANITY_API_TOKEN) in env or .dev.vars.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function loadDevVars() {
  const path = join(rootDir, '.dev.vars');
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const env = {};
  let lastKey = null;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      lastKey = null;
      continue;
    }
    if (trimmed.startsWith('#')) {
      lastKey = null;
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1 && lastKey && (lastKey === 'SANITY_TOKEN' || lastKey === 'SANITY_API_TOKEN') && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      // Continuation: token wrapped to next line (alphanumeric fragment only)
      env[lastKey] = (env[lastKey] || '').concat(trimmed.replace(/\r/g, ''));
      continue;
    }
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim().replace(/\r/g, '');
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value;
    lastKey = key;
  }
  return env;
}

const env = { ...process.env, ...loadDevVars() };

const configured = !!(env.SANITY_PROJECT_ID && (env.SANITY_TOKEN || env.SANITY_API_TOKEN));
if (!configured) {
  console.error('Sanity not configured. Set SANITY_PROJECT_ID and SANITY_TOKEN (or SANITY_API_TOKEN) in .dev.vars or env.');
  process.exit(1);
}

const token = env.SANITY_TOKEN || env.SANITY_API_TOKEN || '';
if (token.length < 100) {
  console.error('SANITY_TOKEN looks truncated (length ' + token.length + '). Sanity tokens are usually 150+ chars.');
  console.error('Put the entire token on a single line in .dev.vars (use the copy button in Sanity, not drag-select).');
  process.exit(1);
}

const { initSanityClient, groqQuery } = await import('../src/sanity-client.js');
const client = initSanityClient(env);
if (!client) {
  console.error('initSanityClient returned null.');
  process.exit(1);
}

try {
  const testResult = await groqQuery(client, 'count(*[_type == "interaction"][0...1])', {});
  const reachable = typeof testResult === 'number' || (Array.isArray(testResult) && testResult.length >= 0);
  if (reachable) {
    console.log('OK Sanity reachable (projectId=***, dataset=' + (env.SANITY_DATASET || 'production') + ')');
    process.exit(0);
  } else {
    console.error('Sanity responded but test query returned unexpected result:', testResult);
    process.exit(1);
  }
} catch (err) {
  console.error('Sanity unreachable:', err.message);
  process.exit(1);
}
