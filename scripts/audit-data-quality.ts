#!/usr/bin/env npx tsx
/**
 * Data Quality Audit Script
 *
 * Scans primary-named-accounts.json and classifies every entry as
 * valid domain, stock ticker, revenue bucket, region name, etc.
 *
 * Usage:
 *   npx tsx scripts/audit-data-quality.ts
 *   npx tsx scripts/audit-data-quality.ts --fix   # writes cleaned file
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  isValidDomain,
  classifyInvalidDomain,
  normalizeRootDomain,
  normalizeAccount,
} from '../shared/pipeline-normalizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_PATH = join(__dirname, '..', 'data', 'primary-named-accounts.json');
const CLEAN_PATH = join(__dirname, '..', 'data', 'primary-named-accounts-clean.json');
const REPORT_PATH = join(__dirname, '..', 'data', 'data-quality-report.json');

function main() {
  const fix = process.argv.includes('--fix');
  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  const domains: string[] = raw.domains || [];

  const valid: string[] = [];
  const invalid: Array<{ domain: string; reason: string }> = [];
  const byReason: Record<string, string[]> = {};

  for (const domain of domains) {
    if (isValidDomain(domain)) {
      const normalized = normalizeRootDomain(domain);
      if (normalized) {
        valid.push(normalized);
      } else {
        const reason = 'normalization_failed';
        invalid.push({ domain, reason });
        (byReason[reason] ||= []).push(domain);
      }
    } else {
      const reason = classifyInvalidDomain(domain);
      invalid.push({ domain, reason });
      (byReason[reason] ||= []).push(domain);
    }
  }

  // Deduplicate valid domains
  const uniqueValid = [...new Set(valid)].sort();

  // Report
  const report = {
    auditedAt: new Date().toISOString(),
    source: raw.source,
    totalInput: domains.length,
    totalValid: uniqueValid.length,
    totalInvalid: invalid.length,
    duplicatesRemoved: valid.length - uniqueValid.length,
    invalidBreakdown: Object.fromEntries(
      Object.entries(byReason)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([reason, items]) => [reason, { count: items.length, examples: items.slice(0, 10) }])
    ),
    validDomainsSample: uniqueValid.slice(0, 20),
  };

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DATA QUALITY AUDIT REPORT');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Source:           ${raw.source}`);
  console.log(`Total input:      ${domains.length}`);
  console.log(`Valid domains:    ${uniqueValid.length} (${((uniqueValid.length / domains.length) * 100).toFixed(1)}%)`);
  console.log(`Invalid entries:  ${invalid.length} (${((invalid.length / domains.length) * 100).toFixed(1)}%)`);
  console.log(`Duplicates:       ${valid.length - uniqueValid.length}`);
  console.log('\nInvalid breakdown:');
  for (const [reason, items] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${reason.padEnd(20)} ${items.length.toString().padStart(4)} entries  (e.g. ${items.slice(0, 3).join(', ')})`);
  }

  // Write report
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${REPORT_PATH}`);

  if (fix) {
    // Write cleaned file
    const cleaned = {
      source: raw.source,
      sheetName: raw.sheetName,
      loadedAt: raw.loadedAt,
      cleanedAt: new Date().toISOString(),
      originalCount: domains.length,
      count: uniqueValid.length,
      removedCount: domains.length - uniqueValid.length,
      domains: uniqueValid,
    };
    writeFileSync(CLEAN_PATH, JSON.stringify(cleaned, null, 2));
    console.log(`\nCleaned file written to: ${CLEAN_PATH}`);
    console.log(`  Removed ${domains.length - uniqueValid.length} invalid/duplicate entries`);
  } else {
    console.log('\nRun with --fix to write cleaned file');
  }

  // Also test the normalizer on a few accounts
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  NORMALIZER SMOKE TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const testCases = [
    { domain: 'hashicorp.com', companyName: 'HashiCorp' },
    { domain: '$100m-$250m' },
    { domain: '0.0.0.1' },
    { domain: 'california' },
    { domain: 'nvda' },
    { domain: 'disney.com', companyName: 'Disney' },
    { domain: 'benjerry.com', companyName: '' },
  ];

  for (const tc of testCases) {
    const result = normalizeAccount(tc, 'xlsx_import');
    if (result.valid) {
      console.log(`  ✅ ${tc.domain.padEnd(25)} → ${result.data!.displayName} (${result.data!.rootDomain})`);
    } else {
      console.log(`  ❌ ${tc.domain.padEnd(25)} → REJECTED: ${result.rejectionReason}`);
    }
    if (result.issues.length > 0) {
      console.log(`     ⚠️  ${result.issues.join(', ')}`);
    }
  }
}

main();
