/**
 * Sanity Account Service
 * Handles account deduplication and master record management
 * 
 * This service ensures that:
 * 1. Accounts are deduplicated by domain (www.example.com = example.com)
 * 2. All related documents (accountPack, brief, etc.) link to the same master account
 * 3. Account data is merged/updated rather than duplicated
 */

/**
 * Normalize domain for consistent matching
 * @param {string} url - URL or domain string
 * @returns {string|null} - Normalized domain (lowercase, no www, no protocol)
 */
export function normalizeDomain(url) {
  if (!url) return null;
  
  try {
    // If it's already a domain, add protocol for URL parsing
    let urlToParse = url;
    if (!url.match(/^https?:\/\//)) {
      urlToParse = `https://${url}`;
    }
    
    const urlObj = new URL(urlToParse);
    let domain = urlObj.hostname.toLowerCase();
    
    // Remove www. prefix
    domain = domain.replace(/^www\./, '');
    
    return domain;
  } catch (e) {
    // Fallback: try to extract domain manually
    const cleaned = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return cleaned || null;
  }
}

/**
 * Normalize canonical URL for consistent account key generation
 * @param {string} url - URL to normalize
 * @returns {string|null} - Normalized URL
 */
export function normalizeCanonicalUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    // Force https, lowercase, strip trailing slash, remove www
    urlObj.protocol = 'https:';
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
    urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    return urlObj.toString().toLowerCase();
  } catch (e) {
    // Fallback normalization
    let normalized = url.toLowerCase().replace(/^https?:\/\//, 'https://');
    normalized = normalized.replace(/^www\./, '');
    normalized = normalized.replace(/\/$/, '') || normalized + '/';
    return normalized;
  }
}

/**
 * Generate account key from canonical URL (SHA-1 hash, full length for better uniqueness)
 * @param {string} canonicalUrl - Canonical URL
 * @returns {Promise<string|null>} - Account key (SHA-1 hash, first 32 chars)
 */
export async function generateAccountKey(canonicalUrl) {
  const normalized = normalizeCanonicalUrl(canonicalUrl);
  if (!normalized) return null;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Use first 32 chars instead of 16 for better uniqueness
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  } catch (e) {
    // Fallback to simple hash if crypto.subtle not available
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 16);
  }
}

/**
 * Extract domain from URL
 * @param {string} url - URL
 * @returns {string} - Domain
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
 * Find existing account by domain (for deduplication)
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} domain - Domain to search for
 * @returns {Promise<object|null>} - Existing account document or null
 */
export async function findAccountByDomain(groqQuery, client, domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return null;
  
  try {
    // Search for accounts with matching domain
    const query = `*[_type == "account" && domain == $domain][0]`;
    const account = await groqQuery(client, query, { domain: normalizedDomain });
    return account ?? null;
  } catch (e) {
    // Log error in production, but don't throw
    // Return null to indicate account not found
    return null;
  }
}

/**
 * Find existing account by accountKey
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>} - Existing account document or null
 */
export async function findAccountByKey(groqQuery, client, accountKey) {
  try {
    const accountId = `account-${accountKey}`;
    const query = `*[_id == $id][0]`;
    const account = await groqQuery(client, query, { id: accountId });
    return account ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract signals from scan data
 * @param {object} scanData - Scan data
 * @returns {string[]} - Array of signal strings
 */
function extractSignals(scanData) {
  if (!scanData) return [];
  
  const signals = [];
  if (scanData.technologyStack) {
    const ts = scanData.technologyStack;
    if (ts.cms?.length) signals.push(...ts.cms.map(c => `CMS: ${c}`));
    if (ts.frameworks?.length) signals.push(...ts.frameworks.map(f => `Framework: ${f}`));
    if (ts.legacySystems?.length) signals.push(...ts.legacySystems.map(l => `Legacy: ${l}`));
    if (ts.pimSystems?.length) signals.push(...ts.pimSystems.map(p => `PIM: ${p}`));
    if (ts.damSystems?.length) signals.push(...ts.damSystems.map(d => `DAM: ${d}`));
    if (ts.lmsSystems?.length) signals.push(...ts.lmsSystems.map(l => `LMS: ${l}`));
  }
  return signals;
}

/**
 * Find or create master account with deduplication
 * This is the core function that ensures accounts are deduplicated
 * 
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {object} client - Sanity client
 * @param {string} canonicalUrl - Canonical URL
 * @param {string} companyName - Company name (optional)
 * @param {object} scanData - Scan data (optional)
 * @returns {Promise<{accountKey: string, accountId: string, isNew: boolean, merged: boolean, existingKey?: string}>}
 */
export async function findOrCreateMasterAccount(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  canonicalUrl,
  companyName = null,
  scanData = null
) {
  const domain = normalizeDomain(canonicalUrl);
  if (!domain) {
    throw new Error('Invalid canonical URL');
  }
  
  // Generate account key from canonical URL
  const accountKey = await generateAccountKey(canonicalUrl);
  if (!accountKey) {
    throw new Error('Failed to generate account key');
  }
  
  // Try to find existing account by accountKey first
  let existingAccount = await findAccountByKey(groqQuery, client, accountKey);
  let merged = false;
  let finalAccountKey = accountKey;
  
  // If not found, try to find by domain (for deduplication)
  if (!existingAccount) {
    const domainAccount = await findAccountByDomain(groqQuery, client, domain);
    if (domainAccount) {
      // Found existing account with same domain but different accountKey
      // This means we need to use the existing accountKey for consistency
      const existingKey = domainAccount.accountKey;
      
      // Update the existing account with new canonicalUrl if it's more canonical
      // (e.g., if existing is http://example.com and new is https://example.com)
      const existingUrl = normalizeCanonicalUrl(domainAccount.canonicalUrl || '');
      const newUrl = normalizeCanonicalUrl(canonicalUrl);
      
      if (newUrl && newUrl !== existingUrl) {
        // Update existing account with new canonical URL and ensure accountKey is consistent
        try {
          await patchDocument(client, domainAccount._id, {
            set: {
              canonicalUrl: canonicalUrl,
              accountKey: accountKey, // Update to new accountKey for consistency
              updatedAt: new Date().toISOString(),
            },
          });
          merged = true;
          finalAccountKey = accountKey; // Use new key going forward
        } catch (patchError) {
          // If patch fails, use existing key but log the issue
          console.error('Failed to update account key:', patchError);
          finalAccountKey = existingKey;
        }
      } else {
        // Use existing accountKey
        finalAccountKey = existingKey;
      }
      
      existingAccount = domainAccount;
      
      return {
        accountKey: finalAccountKey,
        accountId: domainAccount._id,
        isNew: false,
        merged: true,
        existingKey: existingKey !== finalAccountKey ? existingKey : undefined,
      };
    }
  }
  
  // Create new account if not found
  if (!existingAccount) {
    const accountId = `account-${finalAccountKey}`;
    const accountDoc = {
      _type: 'account',
      _id: accountId,
      accountKey: finalAccountKey,
      canonicalUrl,
      domain: domain,
      companyName: companyName || scanData?.businessUnits?.companyName || null,
      technologyStack: scanData?.technologyStack || null,
      aiReadiness: scanData?.aiReadiness ? { score: scanData.aiReadiness.score } : null,
      opportunityScore: scanData?.technologyStack?.opportunityScore || null,
      performance: scanData?.performance ? { performanceScore: scanData.performance.performanceScore } : null,
      businessScale: scanData?.businessScale ? { businessScale: scanData.businessScale.businessScale } : null,
      signals: extractSignals(scanData).slice(0, 20),
      lastScannedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await upsertDocument(client, accountDoc);
    
    return {
      accountKey: finalAccountKey,
      accountId,
      isNew: true,
      merged: false,
    };
  }
  
  // Update existing account (merge data)
  const accountId = existingAccount._id;
  const updateData = {
    updatedAt: new Date().toISOString(),
    lastScannedAt: new Date().toISOString(),
  };
  
  // Merge company name if provided and existing is null
  if (companyName && !existingAccount.companyName) {
    updateData.companyName = companyName;
  }
  
  // Merge scan data if provided (only update if existing is null/empty)
  if (scanData) {
    if (scanData.technologyStack && !existingAccount.technologyStack) {
      updateData.technologyStack = scanData.technologyStack;
    }
    if (scanData.aiReadiness && !existingAccount.aiReadiness) {
      updateData.aiReadiness = { score: scanData.aiReadiness.score };
    }
    if (scanData.technologyStack?.opportunityScore !== undefined && existingAccount.opportunityScore === null) {
      updateData.opportunityScore = scanData.technologyStack.opportunityScore;
    }
    if (scanData.performance && !existingAccount.performance) {
      updateData.performance = { performanceScore: scanData.performance.performanceScore };
    }
    if (scanData.businessScale && !existingAccount.businessScale) {
      updateData.businessScale = { businessScale: scanData.businessScale.businessScale };
    }
    
    // Merge signals (deduplicate)
    const existingSignals = existingAccount.signals || [];
    const newSignals = extractSignals(scanData);
    const mergedSignals = [...new Set([...existingSignals, ...newSignals])].slice(0, 20);
    if (mergedSignals.length > 0) {
      updateData.signals = mergedSignals;
    }
  }
  
  if (Object.keys(updateData).length > 2) { // More than just updatedAt and lastScannedAt
    await patchDocument(client, accountId, { set: updateData });
  }
  
  return {
    accountKey: existingAccount.accountKey || finalAccountKey,
    accountId,
    isNew: false,
    merged: false,
  };
}

/**
 * Get master account with all related documents
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>} - Master account with related documents
 */
export async function getMasterAccount(groqQuery, client, accountKey) {
  // Get account
  const account = await findAccountByKey(groqQuery, client, accountKey);
  if (!account) {
    return null;
  }
  
  // Get all related documents
  const query = `*[accountKey == $accountKey]`;
  const relatedDocs = await groqQuery(client, query, { accountKey });
  
  return {
    account,
    accountPack: relatedDocs.find(doc => doc._type === 'accountPack') || null,
    briefs: relatedDocs.filter(doc => doc._type === 'brief') || [],
    linkedin: relatedDocs.find(doc => doc._type === 'linkedin') || null,
    evidence: relatedDocs.find(doc => doc._type === 'evidence') || null,
    totalDocuments: relatedDocs.length,
  };
}
