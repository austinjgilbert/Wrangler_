/**
 * Person Storage Service
 * Enhanced storage for person intelligence mode with all required fields
 */

import { generatePersonKey } from './enhanced-storage-service.js';
import { normalizeDomain, normalizeCanonicalUrl } from './sanity-account.js';

/**
 * Upsert person document with merge semantics
 * Supports all person intelligence fields
 */
export async function upsertPerson(
  groqQuery,
  upsertDocument,
  client,
  personData,
  options = {}
) {
  try {
    const {
      rootDomain,
      profileUrl,
      name,
      companyName,
      canonicalUrl,
      title,
      function: personFunction,
      seniority,
      scopeInference,
      execClaimsUsed = [],
      teamMap,
      linkedAccountKey,
      linkedBriefRef,
      evidenceRefs = [],
      verificationRefs = [],
      runId,
      requestId,
      patch = {},
    } = options;

    // Generate person key
    let personKey = personData.personKey;
    if (!personKey) {
      personKey = await generatePersonKey(profileUrl || personData.linkedInUrl, name || personData.name);
    }

    if (!personKey) {
      return { success: false, error: 'Could not generate person key' };
    }

    // Check for existing person
    const existingQuery = `*[_type == "person" && personKey == $personKey][0]`;
    const existing = await groqQuery(client, existingQuery, { personKey });
    const existingPerson = (existing && existing.length > 0) ? existing[0] : null;

    // Merge data intelligently
    const mergedData = {
      ...(existingPerson || {}),
      ...personData,
      _type: 'person',
      _id: existingPerson?._id || `person.${personKey}`,
      personKey,
      name: name || personData.name || existingPerson?.name,
      linkedInUrl: profileUrl || personData.linkedInUrl || existingPerson?.linkedInUrl,
      currentCompany: companyName || personData.currentCompany || existingPerson?.currentCompany,
      currentTitle: title || personData.currentTitle || existingPerson?.currentTitle,
      ...patch,
    };

    // Add new fields if provided
    if (rootDomain) mergedData.rootDomain = rootDomain;
    if (canonicalUrl) mergedData.canonicalUrl = canonicalUrl;
    if (personFunction) mergedData.function = personFunction;
    if (seniority) mergedData.seniority = seniority;
    if (scopeInference) mergedData.scopeInference = scopeInference;

    // Merge execClaimsUsed with deduplication
    const existingClaims = existingPerson?.execClaimsUsed || [];
    const newClaims = Array.isArray(execClaimsUsed) ? execClaimsUsed : [];
    mergedData.execClaimsUsed = dedupeExecClaims([...existingClaims, ...newClaims]);

    // Merge teamMap nodes with deduplication
    if (teamMap || existingPerson?.teamMap) {
      mergedData.teamMap = mergeTeamMaps(existingPerson?.teamMap, teamMap);
    }

    // Merge reference arrays
    if (linkedAccountKey) mergedData.linkedAccountKey = linkedAccountKey;
    if (linkedBriefRef) mergedData.linkedBriefRef = linkedBriefRef;
    if (evidenceRefs.length > 0) {
      mergedData.evidenceRefs = [...new Set([...(existingPerson?.evidenceRefs || []), ...evidenceRefs])];
    }
    if (verificationRefs.length > 0) {
      mergedData.verificationRefs = [...new Set([...(existingPerson?.verificationRefs || []), ...verificationRefs])];
    }

    // Add run metadata
    if (runId) mergedData.runId = runId;
    if (requestId) mergedData.requestId = requestId;
    mergedData.updatedAt = new Date().toISOString();
    if (!mergedData.createdAt) {
      mergedData.createdAt = mergedData.updatedAt;
    }

    // Store/update
    await upsertDocument(client, mergedData);
    // Sanity mutate does not return { success }; no throw = success

    return {
      success: true,
      personKey,
      personId: mergedData._id,
      isNew: !existingPerson,
    };

  } catch (error) {
    console.error('Error upserting person:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deduplicate exec claims by speaker+claim+url
 */
function dedupeExecClaims(claims) {
  const seen = new Set();
  return claims.filter(claim => {
    if (!claim || typeof claim !== 'object') return false;
    
    const key = `${claim.speaker || ''}-${claim.claim || ''}-${claim.url || ''}`;
    if (seen.has(key)) return false;
    
    seen.add(key);
    return true;
  });
}

/**
 * Merge team maps, deduplicating nodes by normalized name+role
 */
function mergeTeamMaps(existingMap, newMap) {
  if (!newMap && !existingMap) return null;
  if (!newMap) return existingMap;
  if (!existingMap) return newMap;

  const merged = {
    nodes: [...(existingMap.nodes || [])],
    edges: [...(existingMap.edges || [])],
  };

  // Deduplicate nodes by normalized name+role
  const nodeKeys = new Set();
  existingMap.nodes?.forEach(node => {
    const key = normalizeNodeKey(node);
    nodeKeys.add(key);
  });

  // Add new nodes
  if (newMap.nodes) {
    newMap.nodes.forEach(node => {
      const key = normalizeNodeKey(node);
      if (!nodeKeys.has(key)) {
        merged.nodes.push(node);
        nodeKeys.add(key);
      }
    });
  }

  // Add new edges (deduplicate by source+target)
  const edgeKeys = new Set();
  existingMap.edges?.forEach(edge => {
    const key = `${edge.source || ''}-${edge.target || ''}-${edge.type || ''}`;
    edgeKeys.add(key);
  });

  if (newMap.edges) {
    newMap.edges.forEach(edge => {
      const key = `${edge.source || ''}-${edge.target || ''}-${edge.type || ''}`;
      if (!edgeKeys.has(key)) {
        merged.edges.push(edge);
        edgeKeys.add(key);
      }
    });
  }

  return merged;
}

/**
 * Normalize node key for deduplication
 */
function normalizeNodeKey(node) {
  if (!node || typeof node !== 'object') return '';
  const name = (node.name || '').toLowerCase().trim();
  const role = (node.role || '').toLowerCase().trim();
  return `${name}::${role}`;
}

