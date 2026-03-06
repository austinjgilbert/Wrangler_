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

// Re-export from sanity-client.js so all code uses the same normalization and key generation
import { normalizeCanonicalUrl as _normalizeCanonicalUrl, generateAccountKey as _generateAccountKey } from '../sanity-client.js';
export const normalizeCanonicalUrl = _normalizeCanonicalUrl;
export const generateAccountKey = _generateAccountKey;

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
    const query = `*[_type == "account" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]`;
    const account = await groqQuery(client, query, {
      dotId: `account.${accountKey}`,
      dashId: `account-${accountKey}`,
      key: accountKey,
    });
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
        success: true,
        accountKey: finalAccountKey,
        accountId: domainAccount._id,
        account: domainAccount,
        isNew: false,
        merged: true,
        existingKey: existingKey !== finalAccountKey ? existingKey : undefined,
      };
    }
  }
  
  // Create new account if not found
  if (!existingAccount) {
    const accountId = `account.${finalAccountKey}`;
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
      success: true,
      accountKey: finalAccountKey,
      accountId,
      account: accountDoc,
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
  
  if (companyName && !existingAccount.companyName) {
    updateData.companyName = companyName;
  }
  
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
    
    const existingSignals = existingAccount.signals || [];
    const newSignals = extractSignals(scanData);
    const mergedSignals = [...new Set([...existingSignals, ...newSignals])].slice(0, 20);
    if (mergedSignals.length > 0) {
      updateData.signals = mergedSignals;
    }
  }
  
  if (Object.keys(updateData).length > 2) {
    await patchDocument(client, accountId, { set: updateData });
  }
  
  const mergedAccount = { ...existingAccount, ...updateData };
  
  return {
    success: true,
    accountKey: existingAccount.accountKey || finalAccountKey,
    accountId,
    account: mergedAccount,
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
