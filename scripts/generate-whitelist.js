#!/usr/bin/env node
/**
 * generate-whitelist.js
 * 
 * Queries ALL document types from Sanity production and extracts every unique
 * field path. Outputs a whitelist file for the Layer 3 attribute guard.
 * 
 * Usage: SANITY_TOKEN=xxx node scripts/generate-whitelist.js
 * 
 * This script should be re-run whenever the schema evolves to keep the
 * whitelist in sync with production reality.
 */

const SANITY_PROJECT_ID = 'nlqb7zmk';
const SANITY_DATASET = 'production';

// All types that the Worker writes to via mutate()
const ACTIVE_TYPES = [
  'account',
  'accountPack', 
  'person',
  'technology',
  'userPattern',
  'usageLog',
  'actionCandidate',
  'orchestrationJob',
  // These 4 were previously misclassified as "pass-through" but ARE written via upsertDocument()
  'interaction',
  'brief',
  'competitorResearch',
  'gmailDraft',
];

// Legacy types that should NEVER be written to
const BLOCKED_TYPES = [
  'enrichmentJob',
  'company',
  'networkPerson',
  'scanResult',
  'crawlResult',
];

/**
 * Recursively extract all dot-notation paths from an object.
 * Skips Sanity internal fields (_id, _rev, _createdAt, _updatedAt, _type)
 * and array item internals (_key, _ref, _type inside arrays).
 */
function extractPaths(obj, prefix = '', paths = new Set()) {
  if (obj === null || obj === undefined) return paths;
  if (typeof obj !== 'object') return paths;
  
  if (Array.isArray(obj)) {
    // For arrays, inspect all items to find all possible paths
    // Use [] notation to indicate "any array item"
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        extractPaths(item, prefix, paths);
      }
    }
    return paths;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip Sanity system fields at root level
    if (!prefix && ['_id', '_rev', '_createdAt', '_updatedAt', '_type'].includes(key)) continue;
    // Skip array item internals
    if (['_key', '_ref', '_type'].includes(key) && prefix) continue;
    
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.add(fullPath);
    
    if (typeof value === 'object' && value !== null) {
      extractPaths(value, fullPath, paths);
    }
  }
  
  return paths;
}

async function queryType(type, token) {
  // Get up to 10 docs per type to capture all field variations
  const query = encodeURIComponent(`*[_type == "${type}"][0...10]`);
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    console.error(`Failed to query ${type}: ${res.status}`);
    return [];
  }
  
  const data = await res.json();
  return data.result || [];
}

async function main() {
  const token = process.env.SANITY_TOKEN;
  if (!token) {
    console.error('SANITY_TOKEN environment variable required');
    process.exit(1);
  }
  
  const whitelistByType = {};
  
  for (const type of ACTIVE_TYPES) {
    console.log(`Querying ${type}...`);
    const docs = await queryType(type, token);
    console.log(`  Found ${docs.length} documents`);
    
    const allPaths = new Set();
    for (const doc of docs) {
      extractPaths(doc, '', allPaths);
    }
    
    const sortedPaths = [...allPaths].sort();
    whitelistByType[type] = sortedPaths;
    console.log(`  Extracted ${sortedPaths.length} unique paths`);
  }
  
  // Output summary
  console.log('\n=== WHITELIST SUMMARY ===');
  let totalPaths = 0;
  for (const [type, paths] of Object.entries(whitelistByType)) {
    console.log(`${type}: ${paths.length} paths`);
    totalPaths += paths.length;
  }
  console.log(`Total: ${totalPaths} paths across ${ACTIVE_TYPES.length} types`);
  console.log(`Blocked types: ${BLOCKED_TYPES.join(', ')}`);
  
  // Write the whitelist data as JSON for inspection
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'production',
    activeTypes: whitelistByType,
    blockedTypes: BLOCKED_TYPES,
  };
  
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/whitelist-data.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\nWritten to scripts/whitelist-data.json');
}

main().catch(console.error);
