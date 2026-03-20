/**
 * Dedup Merger — merges duplicate clusters into single canonical records.
 *
 * For each cluster:
 * 1. Fetch full winner + loser documents
 * 2. Merge loser fields into winner (fill gaps, merge arrays, keep best values)
 * 3. Repoint all references from loser IDs → winner ID
 * 4. Delete loser documents
 *
 * All mutations are batched into a single Sanity transaction per cluster.
 */

import { normalizeAccountDisplayName } from '../../shared/accountNameNormalizer.js';

// ── Field merge helpers ──────────────────────────────────────────────────────

function mergeArraysUnique(existing, incoming) {
  if (!incoming || !Array.isArray(incoming)) return existing || [];
  if (!existing || !Array.isArray(existing)) return incoming;
  const seen = new Set(existing.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  const merged = [...existing];
  for (const item of incoming) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  return merged;
}

function mergeRefArrays(existing, incoming) {
  if (!incoming || !Array.isArray(incoming)) return existing || [];
  if (!existing || !Array.isArray(existing)) return incoming;
  const seen = new Set(existing.map(r => r?._ref || JSON.stringify(r)));
  const merged = [...existing];
  for (const ref of incoming) {
    const key = ref?._ref || JSON.stringify(ref);
    if (!seen.has(key)) {
      merged.push(ref);
      seen.add(key);
    }
  }
  return merged;
}

function pickBest(existing, incoming) {
  if (incoming != null && incoming !== '' && incoming !== 0) return incoming;
  return existing;
}

function pickLongerString(existing, incoming) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return incoming.length > existing.length ? incoming : existing;
}

function pickHigherNumber(existing, incoming) {
  if (incoming == null) return existing;
  if (existing == null) return incoming;
  return Math.max(existing, incoming);
}

function pickNewerDate(existing, incoming) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return new Date(incoming) > new Date(existing) ? incoming : existing;
}

function mergeObjects(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing;
  if (!existing || typeof existing !== 'object') return incoming;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === '') continue;
    if (merged[key] == null || merged[key] === '') {
      merged[key] = value;
    }
  }
  return merged;
}

// ── Account merge ────────────────────────────────────────────────────────────

function mergeAccountFields(winner, loser) {
  const merged = { ...winner };

  // Identity — fill gaps
  merged.name = pickBest(merged.name, loser.name);
  merged.companyName = pickLongerString(merged.companyName, loser.companyName);
  merged.domain = pickBest(merged.domain, loser.domain);
  merged.rootDomain = pickBest(merged.rootDomain, loser.rootDomain);
  merged.canonicalUrl = pickBest(merged.canonicalUrl, loser.canonicalUrl);
  merged.accountKey = pickBest(merged.accountKey, loser.accountKey);
  merged.industry = pickBest(merged.industry, loser.industry);

  // Classification
  merged.classification = mergeObjects(merged.classification, loser.classification);

  // Tags
  merged.tags = mergeArraysUnique(merged.tags, loser.tags);

  // Tech stack — merge sub-arrays
  if (loser.technologyStack) {
    if (!merged.technologyStack) {
      merged.technologyStack = loser.technologyStack;
    } else {
      const ts = merged.technologyStack;
      const ls = loser.technologyStack;
      for (const key of Object.keys(ls)) {
        if (Array.isArray(ls[key])) {
          ts[key] = mergeArraysUnique(ts[key], ls[key]);
        } else if (ts[key] == null) {
          ts[key] = ls[key];
        }
      }
      merged.technologyStack = ts;
    }
  }
  merged.techStack = mergeArraysUnique(merged.techStack, loser.techStack);
  merged.technologies = mergeRefArrays(merged.technologies, loser.technologies);

  // Leadership — merge reference arrays
  merged.leadership = mergeRefArrays(merged.leadership, loser.leadership);

  // Pain points
  merged.painPoints = mergeArraysUnique(merged.painPoints, loser.painPoints);

  // Competitors
  merged.competitors = mergeRefArrays(merged.competitors, loser.competitors);
  merged.competitorResearch = mergeObjects(merged.competitorResearch, loser.competitorResearch);

  // Benchmarks
  merged.benchmarks = mergeObjects(merged.benchmarks, loser.benchmarks);

  // Scores — keep higher
  merged.opportunityScore = pickHigherNumber(merged.opportunityScore, loser.opportunityScore);
  merged.aiReadiness = mergeObjects(merged.aiReadiness, loser.aiReadiness);
  merged.performance = mergeObjects(merged.performance, loser.performance);
  merged.businessScale = mergeObjects(merged.businessScale, loser.businessScale);
  merged.businessUnits = mergeObjects(merged.businessUnits, loser.businessUnits);

  // Signals
  merged.signals = mergeArraysUnique(merged.signals, loser.signals);

  // Profile completeness — keep higher score
  if (loser.profileCompleteness?.score > (merged.profileCompleteness?.score || 0)) {
    merged.profileCompleteness = loser.profileCompleteness;
  }

  // Timestamps — keep newest
  merged.lastScannedAt = pickNewerDate(merged.lastScannedAt, loser.lastScannedAt);
  merged.lastEnrichedAt = pickNewerDate(merged.lastEnrichedAt, loser.lastEnrichedAt);
  merged.createdAt = merged.createdAt || loser.createdAt;

  // Evidence refs
  merged.evidenceRefs = mergeRefArrays(merged.evidenceRefs, loser.evidenceRefs);

  // Data quality flags
  merged.dataQualityFlags = mergeArraysUnique(merged.dataQualityFlags, loser.dataQualityFlags);

  // Normalize display name
  const displayName = normalizeAccountDisplayName(merged);
  if (displayName) {
    merged.name = displayName;
    merged.companyName = displayName;
  }

  merged.updatedAt = new Date().toISOString();

  return merged;
}

// ── Person merge ─────────────────────────────────────────────────────────────

function mergePersonFields(winner, loser) {
  const merged = { ...winner };

  // Identity
  merged.name = pickLongerString(merged.name, loser.name);
  if (merged.name === 'Unknown' && loser.name && loser.name !== 'Unknown') {
    merged.name = loser.name;
  }
  merged.personKey = pickBest(merged.personKey, loser.personKey);
  merged.linkedInUrl = pickBest(merged.linkedInUrl, loser.linkedInUrl);
  merged.linkedinUrl = pickBest(merged.linkedinUrl, loser.linkedinUrl);
  merged.email = pickBest(merged.email, loser.email);
  merged.phone = pickBest(merged.phone, loser.phone);
  merged.location = pickBest(merged.location, loser.location);
  merged.headline = pickLongerString(merged.headline, loser.headline);
  merged.about = pickLongerString(merged.about, loser.about);
  merged.title = pickBest(merged.title, loser.title);
  merged.currentTitle = pickBest(merged.currentTitle, loser.currentTitle);
  merged.currentCompany = pickBest(merged.currentCompany, loser.currentCompany);
  merged.rootDomain = pickBest(merged.rootDomain, loser.rootDomain);
  merged.relatedAccountKey = pickBest(merged.relatedAccountKey, loser.relatedAccountKey);

  // Company link
  merged.companyRef = pickBest(merged.companyRef, loser.companyRef);

  // Role & influence
  merged.roleCategory = pickBest(merged.roleCategory, loser.roleCategory);
  merged.seniorityLevel = pickBest(merged.seniorityLevel, loser.seniorityLevel);
  merged.isDecisionMaker = merged.isDecisionMaker || loser.isDecisionMaker;
  merged.buyerPersona = pickBest(merged.buyerPersona, loser.buyerPersona);

  // Experience — merge by company+title key
  if (loser.experience && Array.isArray(loser.experience)) {
    const existing = merged.experience || [];
    const seen = new Set(existing.map(e => `${e.company || ''}|${e.title || ''}`));
    for (const exp of loser.experience) {
      const key = `${exp.company || ''}|${exp.title || ''}`;
      if (!seen.has(key)) {
        existing.push(exp);
        seen.add(key);
      }
    }
    merged.experience = existing;
  }

  // Education
  if (loser.education && Array.isArray(loser.education)) {
    const existing = merged.education || [];
    const seen = new Set(existing.map(e => `${e.school || ''}|${e.degree || ''}`));
    for (const edu of loser.education) {
      const key = `${edu.school || ''}|${edu.degree || ''}`;
      if (!seen.has(key)) {
        existing.push(edu);
        seen.add(key);
      }
    }
    merged.education = existing;
  }

  // Skills, signals, tags, sourceSystems
  merged.skills = mergeArraysUnique(merged.skills, loser.skills);
  merged.signals = mergeArraysUnique(merged.signals, loser.signals);
  merged.tags = mergeArraysUnique(merged.tags, loser.tags);
  merged.sourceSystems = mergeArraysUnique(merged.sourceSystems, loser.sourceSystems);

  // LinkedIn intelligence
  merged.connections = pickHigherNumber(merged.connections, loser.connections);
  merged.followers = pickHigherNumber(merged.followers, loser.followers);
  merged.workPatterns = mergeObjects(merged.workPatterns, loser.workPatterns);
  merged.trajectory = mergeObjects(merged.trajectory, loser.trajectory);

  // Relationship
  merged.relationshipStrength = pickHigherNumber(merged.relationshipStrength, loser.relationshipStrength);
  merged.lastTouchedAt = pickNewerDate(merged.lastTouchedAt, loser.lastTouchedAt);

  // Timestamps
  merged.lastEnrichedAt = pickNewerDate(merged.lastEnrichedAt, loser.lastEnrichedAt);
  merged.scannedAt = pickNewerDate(merged.scannedAt, loser.scannedAt);
  merged.createdAt = merged.createdAt || loser.createdAt;

  // Evidence refs
  merged.evidenceRefs = mergeRefArrays(merged.evidenceRefs, loser.evidenceRefs);
  merged.dataQualityFlags = mergeArraysUnique(merged.dataQualityFlags, loser.dataQualityFlags);

  // Uncertainty — keep the more confident state
  const confidenceOrder = ['confirmed', 'likely', 'weakly_inferred', 'needs_validation', 'contradictory', 'stale'];
  const winnerIdx = confidenceOrder.indexOf(merged.uncertaintyState || 'needs_validation');
  const loserIdx = confidenceOrder.indexOf(loser.uncertaintyState || 'needs_validation');
  if (loserIdx < winnerIdx) {
    merged.uncertaintyState = loser.uncertaintyState;
  }

  merged.updatedAt = new Date().toISOString();

  return merged;
}

// ── Reference repointing ────────────────────────────────────────────────────

/**
 * Find all documents that reference any of the loser IDs and build
 * patch mutations to repoint them to the winner ID.
 */
async function buildRepointMutations(groqQuery, client, winnerRef, loserIds) {
  const mutations = [];

  for (const loserId of loserIds) {
    // Find all documents that reference this loser
    const query = `*[references($loserId)] { _id, _type }`;
    const referencing = await groqQuery(client, query, { loserId }) || [];

    for (const doc of referencing) {
      if (!doc._id) continue;
      // Skip the loser document itself (it will be deleted)
      if (loserIds.includes(doc._id)) continue;

      // Fetch the full document to find and replace references
      const fullQuery = `*[_id == $id][0]`;
      const fullDoc = await groqQuery(client, fullQuery, { id: doc._id });
      if (!fullDoc) continue;

      // Build a patch that replaces the loser ref with winner ref
      // We need to find all reference fields pointing to loserId
      const patches = findAndReplaceRefs(fullDoc, loserId, winnerRef);
      if (patches && Object.keys(patches).length > 0) {
        mutations.push({
          patch: {
            id: doc._id,
            set: patches,
          },
        });
      }
    }
  }

  return mutations;
}

/**
 * Recursively find reference fields pointing to oldRef and return
 * a flat patch object with the new ref.
 */
function findAndReplaceRefs(obj, oldId, newId, path = '') {
  const patches = {};

  if (!obj || typeof obj !== 'object') return patches;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (item && typeof item === 'object') {
        if (item._ref === oldId) {
          // For array items, we need to set the whole array
          // (Sanity doesn't support patching individual array items by index easily)
          // Instead, we'll rebuild the array with the replacement
          const arrayPath = path || '_unknown';
          if (!patches[arrayPath]) {
            patches[arrayPath] = obj.map(el => {
              if (el && el._ref === oldId) {
                return { ...el, _ref: newId };
              }
              return el;
            });
          }
        } else {
          const subPatches = findAndReplaceRefs(item, oldId, newId, `${path}[${i}]`);
          Object.assign(patches, subPatches);
        }
      }
    }
  } else {
    // Check if this object is a reference
    if (obj._ref === oldId) {
      const refPath = path || '_ref';
      patches[`${path ? path + '.' : ''}_ref`] = newId;
    }

    // Recurse into object fields
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('_') && key !== '_ref') continue; // Skip Sanity internals
      if (value && typeof value === 'object') {
        const subPath = path ? `${path}.${key}` : key;
        const subPatches = findAndReplaceRefs(value, oldId, newId, subPath);
        Object.assign(patches, subPatches);
      }
    }
  }

  return patches;
}

// ── Merge executor ──────────────────────────────────────────────────────────

/**
 * Merge a single account cluster.
 * Returns { winnerId, mergedFrom, refsMoved, mutations } for dry-run,
 * or executes mutations if dryRun=false.
 */
export async function mergeAccountCluster(
  groqQuery,
  client,
  mutate,
  cluster,
  { dryRun = true } = {}
) {
  const winnerId = cluster.winner._id;
  const loserIds = cluster.losers.map(l => l._id);

  // Fetch full documents
  const allIds = [winnerId, ...loserIds];
  const fullQuery = `*[_id in $ids]`;
  const fullDocs = await groqQuery(client, fullQuery, { ids: allIds }) || [];

  let winnerDoc = fullDocs.find(d => d._id === winnerId);
  if (!winnerDoc) {
    return { error: `Winner document ${winnerId} not found`, winnerId, loserIds };
  }

  // Merge all losers into winner
  for (const loserId of loserIds) {
    const loserDoc = fullDocs.find(d => d._id === loserId);
    if (loserDoc) {
      winnerDoc = mergeAccountFields(winnerDoc, loserDoc);
    }
  }

  // Build mutations
  const mutations = [];

  // 1. Update winner with merged data (patch, not createOrReplace — preserves fields we don't track)
  const { _id, _rev, _type, _createdAt, _updatedAt, ...mergedFields } = winnerDoc;
  mutations.push({
    patch: {
      id: winnerId,
      set: mergedFields,
    },
  });

  // 2. Repoint references from losers → winner
  const repointMutations = await buildRepointMutations(groqQuery, client, winnerId, loserIds);
  mutations.push(...repointMutations);

  // 3. Also repoint any documents that reference loser accountKeys
  for (const loserId of loserIds) {
    const loserDoc = fullDocs.find(d => d._id === loserId);
    if (loserDoc?.accountKey && loserDoc.accountKey !== winnerDoc.accountKey) {
      // Find docs referencing the old accountKey
      const akQuery = `*[accountKey == $ak && _id != $winnerId] { _id }`;
      const akDocs = await groqQuery(client, akQuery, { ak: loserDoc.accountKey, winnerId }) || [];
      for (const doc of akDocs) {
        mutations.push({
          patch: {
            id: doc._id,
            set: { accountKey: winnerDoc.accountKey },
          },
        });
      }
    }
  }

  // 4. Delete losers
  for (const loserId of loserIds) {
    mutations.push({ delete: { id: loserId } });
  }

  if (dryRun) {
    return {
      winnerId,
      winnerName: winnerDoc.companyName || winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      dryRun: true,
    };
  }

  // Execute and verify result
  let result;
  try {
    result = await mutate(client, mutations);
  } catch (err) {
    return {
      winnerId,
      winnerName: winnerDoc.companyName || winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: false,
      error: `Mutation failed: ${err?.message || 'unknown error'}`,
    };
  }

  // Sanity must return a result object with a transactionId for a successful commit
  if (!result || (!result.transactionId && !result.results)) {
    return {
      winnerId,
      winnerName: winnerDoc.companyName || winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: false,
      error: 'Mutation returned empty or invalid response — no transactionId or results',
    };
  }

  // Check for partial errors in Sanity response
  const mutationResults = result.results || [];
  const failedMutations = mutationResults.filter(r => r?.error);
  if (failedMutations.length > 0) {
    return {
      winnerId,
      winnerName: winnerDoc.companyName || winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: true,
      partialFailure: true,
      failedCount: failedMutations.length,
      errors: failedMutations.map(f => f.error),
    };
  }

  return {
    winnerId,
    winnerName: winnerDoc.companyName || winnerDoc.name,
    loserIds,
    refsMoved: repointMutations.length,
    totalMutations: mutations.length,
    transactionId: result.transactionId || null,
    executed: true,
  };
}

/**
 * Merge a single person cluster.
 */
export async function mergePersonCluster(
  groqQuery,
  client,
  mutate,
  cluster,
  { dryRun = true } = {}
) {
  const winnerId = cluster.winner._id;
  const loserIds = cluster.losers.map(l => l._id);

  // Fetch full documents
  const allIds = [winnerId, ...loserIds];
  const fullQuery = `*[_id in $ids]`;
  const fullDocs = await groqQuery(client, fullQuery, { ids: allIds }) || [];

  let winnerDoc = fullDocs.find(d => d._id === winnerId);
  if (!winnerDoc) {
    return { error: `Winner document ${winnerId} not found`, winnerId, loserIds };
  }

  // Merge all losers into winner
  for (const loserId of loserIds) {
    const loserDoc = fullDocs.find(d => d._id === loserId);
    if (loserDoc) {
      winnerDoc = mergePersonFields(winnerDoc, loserDoc);
    }
  }

  // Build mutations
  const mutations = [];

  // 1. Update winner with merged data (patch, not createOrReplace — preserves fields we don't track)
  const { _id, _rev, _type, _createdAt, _updatedAt, ...mergedFields } = winnerDoc;
  mutations.push({
    patch: {
      id: winnerId,
      set: mergedFields,
    },
  });

  // 2. Repoint references from losers → winner
  const repointMutations = await buildRepointMutations(groqQuery, client, winnerId, loserIds);
  mutations.push(...repointMutations);

  // 3. Repoint networkPerson.personRef from losers → winner
  for (const loserId of loserIds) {
    const npQuery = `*[_type == "networkPerson" && personRef._ref == $loserId] { _id }`;
    const networkPersons = await groqQuery(client, npQuery, { loserId }) || [];
    for (const np of networkPersons) {
      mutations.push({
        patch: {
          id: np._id,
          set: { 'personRef._ref': winnerId },
        },
      });
    }
  }

  // 4. Repoint account.leadership references from losers → winner
  for (const loserId of loserIds) {
    const leaderQuery = `*[_type == "account" && references($loserId)] { _id, leadership }`;
    const accounts = await groqQuery(client, leaderQuery, { loserId }) || [];
    for (const account of accounts) {
      if (account.leadership && Array.isArray(account.leadership)) {
        const updated = account.leadership.map(ref => {
          if (ref?._ref === loserId) return { ...ref, _ref: winnerId };
          return ref;
        });
        // Deduplicate — don't have winner twice
        const seen = new Set();
        const deduped = updated.filter(ref => {
          const key = ref?._ref || JSON.stringify(ref);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        mutations.push({
          patch: {
            id: account._id,
            set: { leadership: deduped },
          },
        });
      }
    }
  }

  // 5. Repoint personKey references in other documents
  for (const loserId of loserIds) {
    const loserDoc = fullDocs.find(d => d._id === loserId);
    if (loserDoc?.personKey && loserDoc.personKey !== winnerDoc.personKey) {
      const pkQuery = `*[personKey == $pk && _id != $winnerId] { _id }`;
      const pkDocs = await groqQuery(client, pkQuery, { pk: loserDoc.personKey, winnerId }) || [];
      for (const doc of pkDocs) {
        mutations.push({
          patch: {
            id: doc._id,
            set: { personKey: winnerDoc.personKey },
          },
        });
      }
    }
  }

  // 6. Delete losers
  for (const loserId of loserIds) {
    mutations.push({ delete: { id: loserId } });
  }

  if (dryRun) {
    return {
      winnerId,
      winnerName: winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      dryRun: true,
    };
  }

  // Execute and verify result
  let result;
  try {
    result = await mutate(client, mutations);
  } catch (err) {
    return {
      winnerId,
      winnerName: winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: false,
      error: `Mutation failed: ${err?.message || 'unknown error'}`,
    };
  }

  // Sanity must return a result object with a transactionId for a successful commit
  if (!result || (!result.transactionId && !result.results)) {
    return {
      winnerId,
      winnerName: winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: false,
      error: 'Mutation returned empty or invalid response — no transactionId or results',
    };
  }

  // Check for partial errors in Sanity response
  const mutationResults = result.results || [];
  const failedMutations = mutationResults.filter(r => r?.error);
  if (failedMutations.length > 0) {
    return {
      winnerId,
      winnerName: winnerDoc.name,
      loserIds,
      refsMoved: repointMutations.length,
      totalMutations: mutations.length,
      executed: true,
      partialFailure: true,
      failedCount: failedMutations.length,
      errors: failedMutations.map(f => f.error),
    };
  }

  return {
    winnerId,
    winnerName: winnerDoc.name,
    loserIds,
    refsMoved: repointMutations.length,
    totalMutations: mutations.length,
    transactionId: result.transactionId || null,
    executed: true,
  };
}
