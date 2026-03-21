/**
 * Technology Analysis Index Migration — Part B
 * 
 * Populates techAnalysisIndex on accountPack documents using data from
 * account.technologyStack. Does NOT populate techAnalysisData (that's
 * WS3's job — AI analysis via POST /technologies/analyze).
 * 
 * For each account with technologyStack data:
 * 1. Count total technologies from allDetected[]
 * 2. Count legacy technologies (from legacySystems[] or name hints)
 * 3. Infer stack maturity (modern/mixed/legacy)
 * 4. Write techAnalysisIndex on the corresponding accountPack
 * 
 * Run: SANITY_TOKEN=xxx node scripts/migrate-tech-analysis-index.js [--dry-run]
 * 
 * @see tech-page-rebuild-spec WS1b, tech-schema-definition
 */

import { createClient } from '@sanity/client';
import crypto from 'crypto';

const PROJECT_ID = 'nlqb7zmk';
const DATASET = 'production';
const API_VERSION = '2024-01-01';

const DRY_RUN = process.argv.includes('--dry-run');

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

// ─── Stack Maturity Inference ─────────────────────────────────────
/**
 * Infer stack maturity from technology counts.
 * @param {number} total - Total technologies detected
 * @param {number} legacyCount - Number of legacy technologies
 * @returns {'modern' | 'mixed' | 'legacy'}
 */
function inferStackMaturity(total, legacyCount) {
  if (total === 0) return 'modern'; // No data = no legacy signal
  const legacyRatio = legacyCount / total;
  if (legacyRatio >= 0.5) return 'legacy';
  if (legacyCount > 0) return 'mixed';
  return 'modern';
}

// ─── Legacy Count from technologyStack ────────────────────────────
/**
 * Count legacy technologies from an account's technologyStack.
 * Uses legacySystems[] array + name hints in allDetected[].
 */
function countLegacy(technologyStack) {
  if (!technologyStack) return 0;

  // Primary: legacySystems array
  const legacySystems = technologyStack.legacySystems || [];
  const legacyFromArray = legacySystems.length;

  // Secondary: check allDetected for "(Legacy)" in name or legacyCms category
  const allDetected = technologyStack.allDetected || [];
  const legacyFromDetected = allDetected.filter(t => {
    if (!t) return false;
    const name = t.name || '';
    const category = t.category || '';
    return name.includes('(Legacy)') || category === 'legacyCms';
  }).length;

  // Use the higher count (avoid double-counting — legacySystems entries
  // are usually also in allDetected with "(Legacy)" suffix)
  return Math.max(legacyFromArray, legacyFromDetected);
}

// ─── Raw Stack Hash ───────────────────────────────────────────────
/**
 * Generate a SHA-256 hash of the technologyStack for cache invalidation.
 * Used by POST /technologies/analyze to detect if raw data changed.
 */
function hashStack(technologyStack) {
  if (!technologyStack) return null;
  // Use a replacer function that sorts object keys for deterministic output.
  // (A replacer *array* filters keys at all levels — not what we want.)
  const serialized = JSON.stringify(technologyStack, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// ─── Main Migration ───────────────────────────────────────────────
async function migrate() {
  console.log(`\n🔧 Tech Analysis Index Migration — Part B`);
  console.log(`   Mode: ${DRY_RUN ? '🏜️  DRY RUN (no writes)' : '🔴 LIVE'}`);
  console.log(`   Project: ${PROJECT_ID} / ${DATASET}\n`);

  // Fetch all accounts with technologyStack
  const accounts = await client.fetch(
    `*[_type == "account" && defined(technologyStack)]{
      _id, accountKey, technologyStack
    }`
  );
  console.log(`📊 Found ${accounts.length} accounts with technologyStack\n`);

  // Fetch all accountPacks for matching
  const accountPacks = await client.fetch(
    `*[_type == "accountPack"]{_id, accountKey}`
  );
  const packByAccountKey = new Map(accountPacks.map(p => [p.accountKey, p._id]));
  console.log(`📦 Found ${accountPacks.length} accountPack documents\n`);

  let updated = 0;
  let skippedNoData = 0;
  let skippedNoPack = 0;
  const maturityCounts = { modern: 0, mixed: 0, legacy: 0 };

  console.log('── Populating techAnalysisIndex ──');

  for (const account of accounts) {
    const stack = account.technologyStack;
    const allDetected = stack?.allDetected || [];
    const totalTechnologies = allDetected.length;

    // Skip accounts with empty tech stacks
    if (totalTechnologies === 0) {
      skippedNoData++;
      continue;
    }

    // Find corresponding accountPack
    const packId = packByAccountKey.get(account.accountKey);
    if (!packId) {
      console.log(`  ⚠️  No accountPack for ${account.accountKey} — skipping`);
      skippedNoPack++;
      continue;
    }

    const legacyCount = countLegacy(stack);
    const stackMaturity = inferStackMaturity(totalTechnologies, legacyCount);
    maturityCounts[stackMaturity]++;

    const index = {
      hasTechAnalysis: false, // true only after AI analysis runs (WS3)
      lastAnalyzedAt: null,   // set by POST /technologies/analyze
      stackMaturity,
      legacyCount,
      totalTechnologies,
    };

    console.log(`  📝 ${account.accountKey}: ${totalTechnologies} techs, ${legacyCount} legacy → ${stackMaturity}`);

    if (!DRY_RUN) {
      await client
        .patch(packId)
        .set({ techAnalysisIndex: index })
        .commit({ visibility: 'async' });
    }

    updated++;
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 Migration Summary`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Accounts with technologyStack: ${accounts.length}`);
  console.log(`  AccountPacks updated:          ${updated}`);
  console.log(`  Skipped (empty stack):         ${skippedNoData}`);
  console.log(`  Skipped (no accountPack):      ${skippedNoPack}`);
  console.log(`  Stack maturity breakdown:`);
  console.log(`    Modern: ${maturityCounts.modern}`);
  console.log(`    Mixed:  ${maturityCounts.mixed}`);
  console.log(`    Legacy: ${maturityCounts.legacy}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (DRY_RUN) {
    console.log('💡 Run without --dry-run to apply changes.');
  }
}

migrate().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
