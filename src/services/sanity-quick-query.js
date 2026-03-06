/**
 * Quick Query Service for Sanity
 * Optimized, pre-built queries for fast database access
 */

/** Normalize GROQ result: [0] queries can return single doc or array */
function singleResult(raw) {
  return Array.isArray(raw) ? (raw.length ? raw[0] : null) : (raw ?? null);
}

/**
 * Quick query: Get account by key
 */
export async function quickGetAccount(client, groqQuery, accountKey) {
  const query = `*[_type == "account" && accountKey == $accountKey][0]{
    _id,
    accountKey,
    canonicalUrl,
    domain,
    companyName,
    technologyStack,
    aiReadiness,
    opportunityScore,
    performance,
    businessScale,
    signals,
    lastScannedAt,
    sourceRefs
  }`;
  
  const raw = await groqQuery(client, query, { accountKey });
  return singleResult(raw);
}

/**
 * Quick query: Get account pack with all data
 */
export async function quickGetAccountPack(client, groqQuery, accountKey) {
  const query = `*[_type == "accountPack" && (accountKey == $accountKey || _id == $dotId || _id == $dashId)][0]{
    _id,
    accountKey,
    canonicalUrl,
    domain,
    payload,
    history,
    updatedAt,
    createdAt
  }`;
  
  const raw = await groqQuery(client, query, {
    accountKey,
    dotId: `accountPack.${accountKey}`,
    dashId: `accountPack-${accountKey}`,
  });
  return singleResult(raw);
}

/**
 * Quick query: Get account by domain
 */
export async function quickGetAccountByDomain(client, groqQuery, domain) {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  const query = `*[_type == "account" && domain == $domain][0]{
    _id,
    accountKey,
    canonicalUrl,
    domain,
    companyName,
    technologyStack,
    aiReadiness,
    opportunityScore,
    signals,
    lastScannedAt
  }`;
  
  const raw = await groqQuery(client, query, { domain: normalizedDomain });
  return singleResult(raw);
}

/**
 * Quick query: Find similar accounts (by tech stack, signals, or industry)
 */
export async function quickFindSimilarAccounts(
  client,
  groqQuery,
  accountKey,
  options = {}
) {
  const { limit = 10, minSimilarity = 0.3 } = options;
  
  // First get the target account
  const account = await quickGetAccount(client, groqQuery, accountKey);
  if (!account) return [];
  
  // Build similarity query based on available data
  let similarityConditions = [];
  
  if (account.signals && account.signals.length > 0) {
    // Match accounts with similar signals
    const signalMatches = account.signals.slice(0, 5).map((signal, idx) => {
      return `count(signals[signal match "*${signal.split(':')[0]}*"]) > 0`;
    });
    if (signalMatches.length > 0) {
      similarityConditions.push(`(${signalMatches.join(' || ')})`);
    }
  }
  
  if (account.technologyStack?.cms?.length > 0) {
    const cmsList = account.technologyStack.cms.map(c => `"${c}"`).join(',');
    similarityConditions.push(`technologyStack.cms[0] in [${cmsList}]`);
  }
  
  if (account.aiReadiness?.score) {
    const score = account.aiReadiness.score;
    const range = 10; // ±10 points
    similarityConditions.push(
      `aiReadiness.score >= ${score - range} && aiReadiness.score <= ${score + range}`
    );
  }
  
  if (similarityConditions.length === 0) {
    return [];
  }
  
  const query = `*[
    _type == "account" 
    && accountKey != $accountKey
    && (${similarityConditions.join(' || ')})
  ] | order(opportunityScore desc) [0...${limit}]{
    _id,
    accountKey,
    companyName,
    domain,
    canonicalUrl,
    technologyStack,
    aiReadiness,
    opportunityScore,
    signals,
    lastScannedAt
  }`;
  
  return await groqQuery(client, query, { accountKey });
}

/**
 * Quick query: Search accounts by company name or domain (fuzzy)
 */
export async function quickSearchAccounts(
  client,
  groqQuery,
  searchTerm,
  options = {}
) {
  const { limit = 20, minScore = null } = options;
  
  const normalizedTerm = searchTerm.toLowerCase().trim();
  
  let query = `*[
    _type == "account" 
    && (
      companyName match "*${normalizedTerm}*"
      || domain match "*${normalizedTerm}*"
      || accountKey match "*${normalizedTerm}*"
    )
  ]`;
  
  if (minScore !== null) {
    query += ` && opportunityScore >= ${minScore}`;
  }
  
  query += ` | order(opportunityScore desc, lastScannedAt desc) [0...${limit}]{
    _id,
    accountKey,
    companyName,
    domain,
    canonicalUrl,
    aiReadiness,
    opportunityScore,
    lastScannedAt
  }`;
  
  return await groqQuery(client, query);
}

/**
 * Quick query: Get accounts with high opportunity scores
 */
export async function quickGetTopAccounts(
  client,
  groqQuery,
  options = {}
) {
  const { limit = 50, minScore = 50 } = options;
  
  const query = `*[
    _type == "account"
    && opportunityScore >= ${minScore}
  ] | order(opportunityScore desc) [0...${limit}]{
    _id,
    accountKey,
    companyName,
    domain,
    canonicalUrl,
    opportunityScore,
    aiReadiness,
    technologyStack,
    lastScannedAt
  }`;
  
  return await groqQuery(client, query);
}

/**
 * Quick query: Check if account exists and get basic info
 */
export async function quickAccountExists(client, groqQuery, identifier) {
  // Try accountKey first, then domain
  const query = `*[
    _type == "account" 
    && (accountKey == $identifier || domain == $identifier)
  ][0]{
    _id,
    accountKey,
    domain,
    companyName,
    lastScannedAt,
    opportunityScore
  }`;
  
  const normalized = identifier.toLowerCase().replace(/^www\./, '');
  const raw = await groqQuery(client, query, { identifier: normalized });
  return singleResult(raw);
}

/**
 * Quick query: Get enrichment status for account
 */
export async function quickGetEnrichmentStatus(
  client,
  groqQuery,
  accountKey,
  accountId = null
) {
  const legacyQuery = `*[_type == "enrichmentJob" && accountKey == $accountKey] | order(updatedAt desc)[0]{
    _id,
    jobId,
    status,
    currentStage,
    completedStages,
    failedStages,
    startedAt,
    updatedAt,
    results,
    priority
  }`;

  const legacyRaw = await groqQuery(client, legacyQuery, { accountKey });
  const legacy = singleResult(legacyRaw);

  const modernQuery = `*[
    _type == "enrich.job"
    && entityType == "account"
    && (
      entityId == $accountId
      || entityId == $dotAccountId
      || entityId == $dashAccountId
      || entityId == $accountKey
    )
  ] | order(coalesce(createdAt, _updatedAt) desc)[0]{
    _id,
    "jobId": _id,
    status,
    goal,
    priority,
    createdAt
  }`;

  const modernRaw = await groqQuery(client, modernQuery, {
    accountKey,
    accountId,
    dotAccountId: accountKey ? `account.${accountKey}` : null,
    dashAccountId: accountKey ? `account-${accountKey}` : null,
  });
  const modern = singleResult(modernRaw);

  if (!legacy && !modern) return null;
  if (legacy && !modern) return legacy;
  if (!legacy && modern) {
    return {
      _id: modern._id,
      jobId: modern.jobId,
      status: modern.status,
      currentStage: modern.goal || 'queued',
      completedStages: [],
      failedStages: [],
      startedAt: modern.createdAt,
      updatedAt: modern.createdAt,
      results: {},
      priority: modern.priority,
      sourceType: 'enrich.job',
    };
  }

  const legacyUpdated = new Date(legacy?.updatedAt || legacy?.startedAt || 0).getTime();
  const modernUpdated = new Date(modern?.createdAt || 0).getTime();
  return modernUpdated > legacyUpdated
    ? {
        _id: modern._id,
        jobId: modern.jobId,
        status: modern.status,
        currentStage: modern.goal || 'queued',
        completedStages: [],
        failedStages: [],
        startedAt: modern.createdAt,
        updatedAt: modern.createdAt,
        results: {},
        priority: modern.priority,
        sourceType: 'enrich.job',
      }
    : legacy;
}

/**
 * Quick query: Get complete account profile (account + pack + enrichment)
 */
export async function quickGetCompleteProfile(
  client,
  groqQuery,
  accountKey
) {
  const account = await quickGetAccount(client, groqQuery, accountKey);
  const [pack, enrichment, similar] = await Promise.all([
    quickGetAccountPack(client, groqQuery, accountKey),
    quickGetEnrichmentStatus(client, groqQuery, accountKey, account?._id || null),
    quickFindSimilarAccounts(client, groqQuery, accountKey, { limit: 5 }),
  ]);
  const enrichmentStatus = enrichment?.status || '';
  
  return {
    account: account || null,
    pack: pack || null,
    enrichment: enrichment || null,
    similarAccounts: similar || [],
    isEnriched: !!enrichment && ['complete', 'completed', 'partial'].includes(enrichmentStatus),
    isEnriching: !!enrichment && ['pending', 'in_progress', 'queued', 'running'].includes(enrichmentStatus),
  };
}

/**
 * Quick query: Get accounts by technology stack components
 */
export async function quickGetAccountsByTech(
  client,
  groqQuery,
  techType,
  techName,
  options = {}
) {
  const { limit = 50 } = options;
  
  // Support: cms, frameworks, pimSystems, damSystems, lmsSystems, legacySystems
  const query = `*[
    _type == "account"
    && technologyStack.${techType}[_key == "${techName}" || match("*${techName}*")]
  ] | order(opportunityScore desc) [0...${limit}]{
    _id,
    accountKey,
    companyName,
    domain,
    technologyStack.${techType},
    opportunityScore,
    aiReadiness
  }`;
  
  return await groqQuery(client, query);
}

/**
 * Quick query: Get accounts needing refresh (stale data)
 */
export async function quickGetStaleAccounts(
  client,
  groqQuery,
  options = {}
) {
  const { 
    daysStale = 30, 
    limit = 100,
    minScore = null 
  } = options;
  
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - daysStale);
  const staleDateStr = staleDate.toISOString().split('T')[0];
  
  let query = `*[
    _type == "account"
    && (!defined(lastScannedAt) || lastScannedAt < "${staleDateStr}")
  ]`;
  
  if (minScore !== null) {
    query += ` && opportunityScore >= ${minScore}`;
  }
  
  query += ` | order(opportunityScore desc) [0...${limit}]{
    _id,
    accountKey,
    companyName,
    domain,
    lastScannedAt,
    opportunityScore
  }`;
  
  return await groqQuery(client, query);
}

