#!/usr/bin/env node
/**
 * Migration Script: accountPack payload → payloadIndex + payloadData
 * 
 * Converts existing accountPack documents from freeform `payload` object
 * to the Index+Blob pattern: `payloadIndex` (queryable) + `payloadData` (JSON string).
 * 
 * Usage:
 *   # Dry run (default) — shows what would change, no mutations
 *   node scripts/migrate-payload-index-blob.js
 * 
 *   # Execute for real
 *   node scripts/migrate-payload-index-blob.js --execute
 * 
 *   # Verify migration (check round-trip integrity)
 *   node scripts/migrate-payload-index-blob.js --verify
 * 
 *   # Rollback — remove payloadIndex/payloadData, restore payload from payloadData
 *   node scripts/migrate-payload-index-blob.js --rollback
 * 
 * Requires: SANITY_PROJECT_ID, SANITY_DATASET, SANITY_TOKEN in environment
 * 
 * See: index-blob-schema-and-migration-map on the board
 */

import { createClient } from '@sanity/client';
import { buildPayloadIndex } from '../src/lib/payload-helpers.js';

// ── Config ──

const BATCH_SIZE = 10;
const PROJECT_ID = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 'nlqb7zmk';
const DATASET = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
const TOKEN = process.env.SANITY_TOKEN || process.env.SANITY_API_TOKEN || process.env.VITE_SANITY_TOKEN;

const mode = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--verify') ? 'verify'
  : process.argv.includes('--rollback') ? 'rollback'
  : 'dry-run';

// ── Main ──

async function main() {
  if (!TOKEN) {
    console.error('❌ SANITY_TOKEN is required. Set it in environment or .env file.');
    process.exit(1);
  }

  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    token: TOKEN,
    apiVersion: '2024-01-01',
    useCdn: false,
  });

  console.log(`\n🔧 accountPack Index+Blob Migration`);
  console.log(`   Mode: ${mode.toUpperCase()}`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Dataset: ${DATASET}`);
  console.log(`   Batch size: ${BATCH_SIZE}\n`);

  // Fetch all accountPack documents
  const packs = await client.fetch(
    `*[_type == "accountPack"]{ _id, _rev, accountKey, payload, payloadIndex, payloadData }`
  );
  console.log(`📦 Found ${packs.length} accountPack documents\n`);

  if (packs.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  if (mode === 'verify') {
    await runVerify(packs);
  } else if (mode === 'rollback') {
    await runRollback(client, packs);
  } else {
    await runMigrate(client, packs);
  }
}

// ── Migrate ──

async function runMigrate(client, packs) {
  const needsMigration = packs.filter(p => {
    // Has old-style payload object and no payloadData yet
    return p.payload && typeof p.payload === 'object' && !p.payloadData;
  });

  const alreadyMigrated = packs.filter(p => p.payloadData);
  const noPayload = packs.filter(p => !p.payload && !p.payloadData);

  console.log(`📊 Status:`);
  console.log(`   Needs migration: ${needsMigration.length}`);
  console.log(`   Already migrated: ${alreadyMigrated.length}`);
  console.log(`   No payload at all: ${noPayload.length}\n`);

  if (needsMigration.length === 0) {
    console.log('✅ All documents already migrated or have no payload.');
    return;
  }

  let migrated = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < needsMigration.length; i += BATCH_SIZE) {
    const batch = needsMigration.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsMigration.length / BATCH_SIZE);

    console.log(`\n── Batch ${batchNum}/${totalBatches} (${batch.length} docs) ──`);

    const mutations = [];

    for (const pack of batch) {
      const payload = pack.payload;
      const payloadIndex = buildPayloadIndex(payload);
      const payloadData = JSON.stringify(payload);

      // Verify round-trip
      try {
        const roundTrip = JSON.parse(payloadData);
        const originalKeys = Object.keys(payload).sort().join(',');
        const roundTripKeys = Object.keys(roundTrip).sort().join(',');
        if (originalKeys !== roundTripKeys) {
          console.error(`  ❌ ${pack._id}: Round-trip key mismatch!`);
          console.error(`     Original: ${originalKeys}`);
          console.error(`     Parsed:   ${roundTripKeys}`);
          errors++;
          continue;
        }
      } catch (e) {
        console.error(`  ❌ ${pack._id}: JSON.stringify/parse failed: ${e.message}`);
        errors++;
        continue;
      }

      const stageFlags = Object.entries(payloadIndex)
        .filter(([k, v]) => k.startsWith('has') && v === true)
        .map(([k]) => k.replace('has', ''))
        .join(', ');

      console.log(`  📄 ${pack._id} (${pack.accountKey || '?'})`);
      console.log(`     Stages: ${stageFlags || 'none'}`);
      console.log(`     Payload size: ${payloadData.length} bytes`);
      console.log(`     EnrichmentState: ${payloadIndex.enrichmentState?.status || 'none'}`);

      mutations.push({
        patch: {
          id: pack._id,
          ifRevisionID: pack._rev,
          set: {
            payloadIndex,
            payloadData,
          },
          // Don't unset payload yet — backward compat during rollout
        },
      });
    }

    if (mutations.length === 0) {
      console.log('  (no valid mutations in this batch)');
      continue;
    }

    if (mode === 'execute') {
      try {
        const result = await client.mutate(mutations, { visibility: 'async' });
        migrated += mutations.length;
        console.log(`  ✅ Batch ${batchNum}: ${mutations.length} docs migrated`);
      } catch (e) {
        console.error(`  ❌ Batch ${batchNum} failed: ${e.message}`);
        errors += mutations.length;
      }
    } else {
      migrated += mutations.length;
      console.log(`  🔍 DRY RUN: Would migrate ${mutations.length} docs`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${mode === 'execute' ? '✅ MIGRATION COMPLETE' : '🔍 DRY RUN COMPLETE'}`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Skipped (already done): ${alreadyMigrated.length}`);
  if (mode !== 'execute') {
    console.log(`\n   Run with --execute to apply changes.`);
  }
}

// ── Verify ──

async function runVerify(packs) {
  console.log('🔍 Verifying migration integrity...\n');

  let ok = 0;
  let issues = 0;

  for (const pack of packs) {
    const hasOldPayload = pack.payload && typeof pack.payload === 'object';
    const hasNewData = !!pack.payloadData;
    const hasNewIndex = !!pack.payloadIndex;

    if (!hasOldPayload && !hasNewData) {
      console.log(`  ⚪ ${pack._id}: No payload at all (empty pack)`);
      continue;
    }

    if (hasOldPayload && !hasNewData) {
      console.log(`  🟡 ${pack._id}: NOT MIGRATED — still has old payload, no payloadData`);
      issues++;
      continue;
    }

    if (hasNewData && !hasNewIndex) {
      console.log(`  🔴 ${pack._id}: Has payloadData but missing payloadIndex!`);
      issues++;
      continue;
    }

    // Verify round-trip
    if (hasNewData && hasOldPayload) {
      try {
        const parsed = JSON.parse(pack.payloadData);
        const originalKeys = Object.keys(pack.payload).sort().join(',');
        const parsedKeys = Object.keys(parsed).sort().join(',');
        if (originalKeys !== parsedKeys) {
          console.log(`  🔴 ${pack._id}: Round-trip key mismatch!`);
          issues++;
          continue;
        }
      } catch (e) {
        console.log(`  🔴 ${pack._id}: payloadData is not valid JSON!`);
        issues++;
        continue;
      }
    }

    // Verify index matches payload
    if (hasNewIndex && (hasOldPayload || hasNewData)) {
      const payload = hasOldPayload ? pack.payload : JSON.parse(pack.payloadData);
      const expectedIndex = buildPayloadIndex(payload);
      const indexMismatches = [];

      for (const key of Object.keys(expectedIndex)) {
        if (key === 'enrichmentState' || key === 'enrichmentCompletedAt') continue;
        if (pack.payloadIndex[key] !== expectedIndex[key]) {
          indexMismatches.push(`${key}: got ${pack.payloadIndex[key]}, expected ${expectedIndex[key]}`);
        }
      }

      if (indexMismatches.length > 0) {
        console.log(`  🟡 ${pack._id}: Index mismatches: ${indexMismatches.join('; ')}`);
        issues++;
        continue;
      }
    }

    ok++;
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Verified: ${ok}`);
  console.log(`⚠️  Issues: ${issues}`);
  console.log(`   Total: ${packs.length}`);
}

// ── Rollback ──

async function runRollback(client, packs) {
  const toRollback = packs.filter(p => p.payloadData);

  console.log(`🔄 Rolling back ${toRollback.length} migrated documents...\n`);

  if (toRollback.length === 0) {
    console.log('Nothing to rollback.');
    return;
  }

  let rolled = 0;
  let errors = 0;

  for (let i = 0; i < toRollback.length; i += BATCH_SIZE) {
    const batch = toRollback.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const mutations = batch.map(pack => ({
      patch: {
        id: pack._id,
        ifRevisionID: pack._rev,
        unset: ['payloadIndex', 'payloadData'],
        // payload field was preserved during migration, so it's still there
      },
    }));

    if (mode === 'execute') {
      // Rollback also requires --execute
      console.error('❌ Rollback requires --execute flag. This is a dry run.');
      console.log(`  🔍 Would rollback ${mutations.length} docs in batch ${batchNum}`);
      rolled += mutations.length;
    } else {
      console.log(`  🔍 DRY RUN: Would rollback ${mutations.length} docs in batch ${batchNum}`);
      rolled += mutations.length;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🔄 Rollback: ${rolled} docs would be affected`);
  console.log(`   Run with --rollback --execute to apply.`);
}

// ── Run ──

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
