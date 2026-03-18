/**
 * Sanity Client for Website Scanner Worker
 * Two-way sync with Sanity CMS: create/upsert, update, query, delete
 * 
 * Document Models:
 * - account: Searchable summary (accountKey, canonicalUrl, domain, scores, signals)
 * - accountPack: Full payload storage (accountKey, payload: {scan, linkedin, evidence, brief, etc})
 */

/**
 * Normalize URL to canonical form for account key generation
 */
function normalizeCanonicalUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    // Force https, lowercase, strip trailing slash
    urlObj.protocol = 'https:';
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
    return urlObj.toString().toLowerCase();
  } catch (e) {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Generate account key from canonical URL (SHA-1 hash)
 */
async function generateAccountKey(canonicalUrl) {
  const normalized = normalizeCanonicalUrl(canonicalUrl);
  if (!normalized) return null;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch (e) {
    // Fallback to simple hash if crypto.subtle not available
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.split('/')[2]?.replace(/^www\./, '') || url;
  }
}

/**
 * Initialize Sanity client
 */
function initSanityClient(env) {
  const projectId = env.SANITY_PROJECT_ID;
  const dataset = env.SANITY_DATASET || 'production';
  const token = env.SANITY_TOKEN || env.SANITY_API_TOKEN;
  const apiVersion = env.SANITY_API_VERSION || '2023-10-01';
  
  if (!projectId || !token) {
    return null; // Sanity not configured
  }
  
  const baseUrl = `https://${projectId}.api.sanity.io/v${apiVersion}`;
  const mutateUrl = `${baseUrl}/data/mutate/${dataset}`;
  const queryUrl = `${baseUrl}/data/query/${dataset}`;
  
  return {
    projectId,
    dataset,
    token,
    baseUrl,
    mutateUrl,
    queryUrl,
    apiVersion,
  };
}

function parseSanityErrorPayload(errorText) {
  if (!errorText) {
    return {
      message: 'Unknown Sanity API error',
      raw: null,
      sanityCode: null,
      statusCode: null,
    };
  }

  try {
    const parsed = JSON.parse(errorText);
    return {
      message: parsed?.message || errorText,
      raw: parsed,
      sanityCode: parsed?.error || parsed?.code || null,
      statusCode: parsed?.statusCode || null,
    };
  } catch {
    return {
      message: errorText,
      raw: errorText,
      sanityCode: null,
      statusCode: null,
    };
  }
}

function buildSanityApiError(response, errorText) {
  const parsed = parseSanityErrorPayload(errorText);
  const error = new Error(`Sanity API error: ${response.status} - ${parsed.message}`);
  error.name = 'SanityApiError';
  error.status = response.status;
  error.code = response.status === 402 && parsed.sanityCode === 'plan_limit_reached'
    ? 'SANITY_QUOTA_REACHED'
    : 'SANITY_API_ERROR';
  error.details = {
    provider: 'sanity',
    providerMessage: parsed.message,
    providerCode: parsed.sanityCode,
    providerStatusCode: parsed.statusCode || response.status,
    quotaExceeded: response.status === 402 && parsed.sanityCode === 'plan_limit_reached',
    raw: parsed.raw,
  };
  return error;
}

function isSanityQuotaError(error) {
  if (!error) return false;
  if (error.code === 'SANITY_QUOTA_REACHED') return true;
  if (error.status === 402 && String(error.message || '').includes('quota')) return true;
  const providerCode = error.details?.providerCode || error.error;
  return providerCode === 'plan_limit_reached';
}

function getSanityServiceError(error) {
  if (isSanityQuotaError(error)) {
    return {
      code: 'SANITY_QUOTA_REACHED',
      status: 503,
      message: 'Sanity API quota reached. Live intelligence data is temporarily unavailable.',
      details: {
        action: 'Upgrade the Sanity plan or wait for the API quota window to reset.',
        manageUrl: 'https://sanity.io/manage',
        providerMessage: error.details?.providerMessage || error.message,
      },
    };
  }

  return {
    code: error?.code || 'SANITY_API_ERROR',
    status: error?.status || 500,
    message: error?.message || 'Sanity request failed.',
    details: error?.details || null,
  };
}

/**
 * Assert Sanity is configured
 * @throws {Error} If Sanity is not configured
 */
function assertSanityConfigured(env) {
  const client = initSanityClient(env);
  if (!client) {
    const missing = [];
    if (!env.SANITY_PROJECT_ID) missing.push('SANITY_PROJECT_ID');
    if (!env.SANITY_TOKEN && !env.SANITY_API_TOKEN) missing.push('SANITY_TOKEN');
    
    const error = new Error('Sanity CMS not configured');
    error.code = 'SANITY_NOT_CONFIGURED';
    error.details = {
      message: `Missing required environment variables: ${missing.join(', ')}`,
      action: 'Set the required secrets using: wrangler secret put SANITY_PROJECT_ID && wrangler secret put SANITY_TOKEN',
      missing,
    };
    throw error;
  }
  return client;
}

/**
 * Sanity API fetch helper
 */
async function sanityFetch(client, path, options = {}) {
  const { method = 'GET', body = null } = options;
  
  const url = path.startsWith('http') ? path : `${client.baseUrl}${path}`;
  
  const headers = {
    'Authorization': `Bearer ${client.token}`,
    'Content-Type': 'application/json',
  };
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw buildSanityApiError(response, errorText);
  }
  
  return await response.json();
}

/**
 * Execute GROQ query with retry
 */
async function groqQuery(client, query, params = {}) {
  const { retrySanityOperation } = await import('./utils/retry.js');
  
  return retrySanityOperation(async () => {
    const queryParams = new URLSearchParams();
    queryParams.append('query', query);
    
    // Pass params as server-side GROQ parameters
    // Sanity expects: $paramName="stringValue" or $paramName=123 in the query string
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      
      if (typeof value === 'string') {
        // Escape backslashes first, then double quotes to prevent injection
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        queryParams.append(`$${key}`, `"${escaped}"`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        queryParams.append(`$${key}`, String(value));
      } else if (Array.isArray(value)) {
        // Arrays need JSON encoding for GROQ
        queryParams.append(`$${key}`, JSON.stringify(value));
      } else {
        // Objects and other types
        queryParams.append(`$${key}`, JSON.stringify(value));
      }
    }
    
    const result = await sanityFetch(client, `${client.queryUrl}?${queryParams.toString()}`);
    return result.result ?? null;
  });
}

/**
 * Execute mutations with retry
 */
async function mutate(client, mutations) {
  // Validate all mutations have document IDs
  for (const m of mutations) {
    if (m.createIfNotExists && !m.createIfNotExists._id) {
      console.error('[mutate] createIfNotExists missing _id:', JSON.stringify(m.createIfNotExists).substring(0, 200));
      throw new Error(`Mutation createIfNotExists missing _id (type: ${m.createIfNotExists._type})`);
    }
    if (m.createOrReplace && !m.createOrReplace._id) {
      console.error('[mutate] createOrReplace missing _id:', JSON.stringify(m.createOrReplace).substring(0, 200));
      throw new Error(`Mutation createOrReplace missing _id (type: ${m.createOrReplace._type})`);
    }
    if (m.create && !m.create._id) {
      console.error('[mutate] create missing _id:', JSON.stringify(m.create).substring(0, 200));
      throw new Error(`Mutation create missing _id (type: ${m.create._type})`);
    }
    if (m.patch && !m.patch.id) {
      console.error('[mutate] patch missing id');
      throw new Error('Mutation patch missing document id');
    }
  }

  const { retrySanityOperation } = await import('./utils/retry.js');
  
  return retrySanityOperation(async () => {
    const result = await sanityFetch(client, client.mutateUrl, {
      method: 'POST',
      body: { mutations },
    });
    return result;
  });
}

/**
 * Upsert document (create if not exists, otherwise patch)
 */
async function upsertDocument(client, doc) {
  if (!doc || !doc._id) {
    console.error('[upsertDocument] Missing _id, doc type:', doc?._type, 'keys:', Object.keys(doc || {}));
    throw new Error(`upsertDocument requires a document with _id (got type: ${doc?._type})`);
  }
  
  const mutations = [
    {
      createIfNotExists: doc,
    },
  ];
  
  mutations.push({
    patch: {
      id: doc._id,
      set: {
        ...doc,
        _updatedAt: new Date().toISOString(),
      },
    },
  });
  
  return await mutate(client, mutations);
}

/**
 * Patch document with set/unset/inc/append operations
 */
async function patchDocument(client, id, operations = {}) {
  if (!id) {
    throw new Error('patchDocument requires a valid document id');
  }
  
  const { set = {}, unset = [], inc = {}, append = null } = operations;
  
  const patch = { id };
  
  if (Object.keys(set).length > 0) {
    patch.set = {
      ...set,
      _updatedAt: new Date().toISOString(),
    };
  }
  
  if (unset.length > 0) {
    patch.unset = unset;
  }
  
  if (Object.keys(inc).length > 0) {
    patch.inc = inc;
  }
  
  if (append) {
    patch.insert = {
      after: append.path + '[-1]',
      items: append.items,
    };
  }
  
  return await mutate(client, [{ patch }]);
}

/**
 * Delete document
 */
async function deleteDocument(client, id) {
  return await mutate(client, [{ delete: { id } }]);
}

/**
 * Get document by ID
 */
async function getDocument(client, docId) {
  const query = `*[_id == $id][0]`;
  const docs = await groqQuery(client, query, { id: docId });
  return docs || null;
}

/**
 * Store account pack (full payload)
 */
async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  const packId = `accountPack-${accountKey}`;
  
  // Get existing pack or create new
  const existing = await getDocument(client, packId);
  
  const now = new Date().toISOString();
  const payloadUpdate = {};
  payloadUpdate[type] = data;
  
  if (existing) {
    // Update existing pack
    const currentPayload = existing.payload || {};
    const updatedPayload = {
      ...currentPayload,
      ...payloadUpdate,
    };
    
    // Append to history if type is 'scan'
    let history = existing.history || [];
    if (type === 'scan') {
      history = [...history, {
        type: 'scan',
        data: data,
        storedAt: now,
      }].slice(-10); // Keep last 10 scans
    }
    
    await patchDocument(client, packId, {
      set: {
        payload: updatedPayload,
        updatedAt: now,
        history: history,
      },
    });
    
    return { success: true, id: packId, isNew: false };
  } else {
    // Create new pack
    const packDoc = {
      _type: 'accountPack',
      _id: packId,
      accountKey,
      canonicalUrl,
      domain: extractDomain(canonicalUrl),
      createdAt: now,
      updatedAt: now,
      payload: payloadUpdate,
      history: type === 'scan' ? [{
        type: 'scan',
        data: data,
        storedAt: now,
      }] : [],
      meta: {
        ...meta,
        storedBy: 'website-scanner-worker',
      },
    };
    
    await upsertDocument(client, packDoc);
    return { success: true, id: packId, isNew: true };
  }
}

/**
 * Store/update account summary
 */
async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
  const accountId = `account.${accountKey}`;
  
  // Extract signals from tech stack (all categories)
  const signals = [];
  if (scanData?.technologyStack) {
    const ts = scanData.technologyStack;
    if (ts.cms?.length) signals.push(...ts.cms.map(c => `CMS: ${c}`));
    if (ts.frameworks?.length) signals.push(...ts.frameworks.map(f => `Framework: ${f}`));
    if (ts.legacySystems?.length) signals.push(...ts.legacySystems.map(l => `Legacy: ${l}`));
    if (ts.pimSystems?.length) signals.push(...ts.pimSystems.map(p => `PIM: ${p}`));
    if (ts.damSystems?.length) signals.push(...ts.damSystems.map(d => `DAM: ${d}`));
    if (ts.lmsSystems?.length) signals.push(...ts.lmsSystems.map(l => `LMS: ${l}`));
    if (ts.analytics?.length) signals.push(...ts.analytics.map(a => `Analytics: ${a}`));
    if (ts.ecommerce?.length) signals.push(...ts.ecommerce.map(e => `E-commerce: ${e}`));
    if (ts.hosting?.length) signals.push(...ts.hosting.map(h => `Hosting: ${h}`));
    if (ts.marketing?.length) signals.push(...ts.marketing.map(m => `Marketing: ${m}`));
    if (ts.payments?.length) signals.push(...ts.payments.map(p => `Payments: ${p}`));
    if (ts.chat?.length) signals.push(...ts.chat.map(c => `Chat: ${c}`));
    if (ts.monitoring?.length) signals.push(...ts.monitoring.map(m => `Monitoring: ${m}`));
    if (ts.authProviders?.length) signals.push(...ts.authProviders.map(a => `Auth: ${a}`));
    if (ts.searchTech?.length) signals.push(...ts.searchTech.map(s => `Search: ${s}`));
    if (ts.cssFrameworks?.length) signals.push(...ts.cssFrameworks.map(c => `CSS: ${c}`));
    if (ts.cdnMedia?.length) signals.push(...ts.cdnMedia.map(c => `CDN: ${c}`));
  }
  
  const accountDoc = {
    _type: 'account',
    _id: accountId,
    accountKey,
    canonicalUrl,
    domain: extractDomain(canonicalUrl),
    companyName: companyName || scanData?.businessUnits?.companyName || null,
    technologyStack: scanData?.technologyStack || null,
    aiReadiness: scanData?.aiReadiness ? { score: scanData.aiReadiness.score } : null,
    opportunityScore: scanData?.technologyStack?.opportunityScore || null,
    performance: scanData?.performance ? { performanceScore: scanData.performance.performanceScore } : null,
    businessScale: scanData?.businessScale ? { businessScale: scanData.businessScale.businessScale } : null,
    signals: signals.slice(0, 50),
    lastScannedAt: new Date().toISOString(),
    sourceRefs: {
      packId: `accountPack-${accountKey}`,
    },
  };
  
  await upsertDocument(client, accountDoc);
  return { success: true, id: accountId };
}

/**
 * Query company accounts with filters
 */
async function queryCompanyAccounts(client, filters = {}) {
  let conditions = '_type == "account"';
  const params = {};
  
  if (filters.minScore !== undefined) {
    conditions += ' && opportunityScore >= $minScore';
    params.minScore = filters.minScore;
  }
  if (filters.minAIReadinessScore !== undefined) {
    conditions += ' && aiReadiness.score >= $minAIReadinessScore';
    params.minAIReadinessScore = filters.minAIReadinessScore;
  }
  if (filters.domain) {
    conditions += ' && domain == $domain';
    params.domain = filters.domain;
  }
  
  let query = `*[${conditions}]`;
  
  if (filters.orderBy) {
    // Only allow safe field names for ordering (structural, can't be parameterized)
    const safeOrderBy = filters.orderBy.replace(/[^a-zA-Z0-9_.]/g, '');
    query += ` | order(${safeOrderBy} desc)`;
  } else {
    query += ' | order(opportunityScore desc)';
  }
  
  if (filters.limit) {
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 1000);
    query += `[0...${limit}]`;
  }
  
  const docs = await groqQuery(client, query, params);
  return { success: true, documents: docs };
}

/**
 * Search documents across types
 */
async function searchSanityDocuments(client, searchTerm, docTypes = []) {
  // Allowlist valid document types to prevent _type injection
  const VALID_DOC_TYPES = new Set([
    'account', 'accountPack', 'websiteScan', 'linkedInProfile',
    'evidencePack', 'researchBrief', 'searchResult', 'verificationResult',
    'companyAccount', 'osintJob', 'osintReport', 'interaction', 'session', 'learning',
  ]);
  
  const requestedTypes = docTypes.length > 0 ? docTypes : ['account', 'accountPack'];
  const types = requestedTypes.filter(t => VALID_DOC_TYPES.has(t));
  
  if (types.length === 0) {
    return { success: true, documents: [] };
  }
  
  // Use _type in $types for parameterized type filtering
  // Wildcard match with server-side params: needs verification against live Sanity.
  // If match + $param wildcards don't work, use sanitized inline fallback.
  const query = '*[_type in $types && (companyName match $searchPattern || domain match $searchPattern || canonicalUrl match $searchPattern || name match $searchPattern || url match $searchPattern)] | order(_updatedAt desc)[0...50]';
  const docs = await groqQuery(client, query, {
    types,
    searchPattern: `*${searchTerm}*`,
  });
  return { success: true, documents: docs };
}

/**
 * Find documents by account key
 */
async function findDocumentsByAccountKey(client, accountKey) {
  const query = '*[accountKey == $accountKey]';
  const docs = await groqQuery(client, query, { accountKey });
  return docs;
}

/**
 * Cascade delete (delete account + accountPack)
 */
async function cascadeDeleteByAccountKey(client, accountKey) {
  const docs = await findDocumentsByAccountKey(client, accountKey);
  const mutations = docs.map(doc => ({ delete: { id: doc._id } }));
  
  if (mutations.length > 0) {
    await mutate(client, mutations);
  }
  
  return { success: true, deletedCount: mutations.length };
}

// Export functions needed by OSINT handlers and other modules
export {
  generateAccountKey,
  normalizeCanonicalUrl,
  initSanityClient,
  assertSanityConfigured,
  isSanityQuotaError,
  getSanityServiceError,
  groqQuery,
  upsertDocument,
  patchDocument,
  deleteDocument,
  getDocument,
  storeAccountPack,
  upsertAccountSummary,
  queryCompanyAccounts,
  searchSanityDocuments,
  findDocumentsByAccountKey,
  cascadeDeleteByAccountKey,
};

// Alias for backward compatibility
export const extractRootDomain = extractDomain;
