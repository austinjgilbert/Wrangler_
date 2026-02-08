#!/usr/bin/env node
/**
 * Open Sanity "Create API token" page for the project in .dev.vars (or env).
 * Run from project root: node scripts/sanity-open-token-page.js
 *
 * Then create a token (Editor), copy it, and set SANITY_TOKEN= in .dev.vars
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
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
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = { ...process.env, ...loadDevVars() };
const projectId = env.SANITY_PROJECT_ID || 'kvxbss3j';

const url = `https://www.sanity.io/manage/personal/project/${projectId}/api#tokens`;
console.log('Open this URL to create an API token (Editor):');
console.log(url);
console.log('');
console.log('Then add the token to .dev.vars:');
console.log('  SANITY_TOKEN=<paste token here>');
console.log('');
console.log('Opening in browser...');

const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
try {
  execSync(`${open} "${url}"`, { stdio: 'ignore' });
} catch {
  console.log('Could not open browser; copy the URL above.');
}
