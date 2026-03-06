/**
 * Trigger network gather: GET /moltbook/crawl to fetch activity from primary + MOLTBOOK_NETWORK_URLs and store in Sanity.
 * Usage: node scripts/gather-network.mjs   or   npm run gather-network
 * Run from project root. Loads .dev.vars for BASE_URL (default: production workers.dev).
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

const BASE_URL = (process.env.BASE_URL || process.env.MOLTBOOK_BASE_URL || 'https://website-scanner.austin-gilbert.workers.dev').replace(/\/$/, '');
const url = `${BASE_URL}/moltbook/crawl`;

console.log('Gathering posts from the network:', url);
const res = await fetch(url, { headers: { Accept: 'application/json' } });
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Gather failed:', res.status, data);
  process.exit(1);
}
console.log('Gather result:', data);
process.exit(0);
