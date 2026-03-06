#!/usr/bin/env node
/**
 * Read an Excel file of named accounts, extract domains, and POST to /accounts/stack-rank.
 * Usage: node scripts/stack-rank-from-xlsx.mjs [path-to.xlsx]
 *        node scripts/stack-rank-from-xlsx.mjs [path-to.xlsx] --load-only   # save domains to data/ for learning, no API
 *        npm run stack-rank-accounts [path-to.xlsx]
 * If no path given, uses: ~/Downloads/My Primary Named Accounts-2026-02-12-22-53-36.xlsx
 *
 * Loads BASE_URL from .dev.vars (default: production workers.dev). Requires Sanity-backed worker (unless --load-only).
 */
import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .dev.vars
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

const BASE_URL = (process.env.BASE_URL || 'https://website-scanner.austin-gilbert.workers.dev').replace(/\/$/, '');

/** Extract root domain from a cell value (URL or domain string) */
function toDomain(value) {
  if (value == null || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  try {
    let url = s;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const u = new URL(url);
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host && host.length < 256) return host;
  } catch (_) {}
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s)) return s.toLowerCase().replace(/^www\./, '');
  return null;
}

/** Get all domains from a sheet (first row = headers, then rows) */
function domainsFromSheet(sheet) {
  const domains = new Set();
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const maxCol = range.e.c + 1;
  const maxRow = range.e.r + 1;
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      const raw = cell && (cell.v ?? cell.w);
      const d = toDomain(raw);
      if (d) domains.add(d);
    }
  }
  return [...domains];
}

function getDefaultPath() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const download = join(home, 'Downloads');
  const name = 'My Primary Named Accounts-2026-02-12-22-53-36.xlsx';
  const exact = join(download, name);
  if (existsSync(exact)) return exact;
  try {
    const files = readdirSync(download);
    const match = files.find((f) => f.startsWith('My Primary Named Accounts') && f.endsWith('.xlsx'));
    if (match) return join(download, match);
  } catch (_) {}
  return exact;
}

const LOAD_ONLY = process.argv.includes('--load-only');
const DATA_DIR = join(root, 'data');
const PRIMARY_ACCOUNTS_PATH = join(DATA_DIR, 'primary-named-accounts.json');

async function main() {
  const args = process.argv.filter((a) => a !== '--load-only');
  const filePath = args[2] || getDefaultPath();
  if (!existsSync(filePath)) {
    console.error('File not found:', filePath);
    console.error('Usage: node scripts/stack-rank-from-xlsx.mjs [path-to.xlsx] [--load-only]');
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const firstSheet = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheet];
  const domains = domainsFromSheet(sheet);
  if (domains.length === 0) {
    console.error('No domains found in the Excel file.');
    process.exit(1);
  }
  console.log('Domains from sheet "%s": %d', firstSheet, domains.length);

  if (LOAD_ONLY) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      source: filePath,
      sheetName: firstSheet,
      loadedAt: new Date().toISOString(),
      count: domains.length,
      domains: domains.sort(),
    };
    writeFileSync(PRIMARY_ACCOUNTS_PATH, JSON.stringify(payload, null, 2));
    console.log('Saved to %s for learning. Run stack-rank later with: npm run stack-rank-accounts', PRIMARY_ACCOUNTS_PATH);
    return;
  }

  const url = `${BASE_URL}/accounts/stack-rank`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains, maxAccounts: 500 }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Stack-rank failed:', res.status, data);
    process.exit(1);
  }

  const ranked = data?.data?.ranked || [];
  console.log('\nRanked %d accounts (total %d):\n', ranked.length, data?.data?.total ?? 0);
  ranked.forEach((r, i) => {
    console.log(
      '%d. %s (score %d) – %s',
      r.rank,
      r.companyName || r.accountKey || r.canonicalUrl,
      r.total,
      (r.whyNow || '').slice(0, 80)
    );
  });
  if (ranked.length > 0) {
    const outPath = join(root, 'stack-rank-result.json');
    writeFileSync(outPath, JSON.stringify({ ranked, total: data?.data?.total, requestId: data?.requestId }, null, 2));
    console.log('\nFull result written to %s', outPath);
  }
}

main();
