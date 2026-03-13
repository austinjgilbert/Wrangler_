/**
 * Enhanced Storage Service
 * Automatically handles deduplication, merging, relationship detection, and enrichment
 */

import { generateAccountKey, normalizeCanonicalUrl } from '../sanity-client.js';
import { normalizeAccountDisplayName } from '../../shared/accountNameNormalizer.js';
import { checkAndMergeAccount, checkAndMergePerson } from './deduplication-service.js';
import { detectAccountRelationships, storeAccountRelationships } from './relationship-service.js';

/**
 * Generate person key from LinkedIn URL or name
 */
export async function generatePersonKey(linkedInUrl, name) {
  if (linkedInUrl) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(linkedInUrl.toLowerCase().trim());
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    } catch (e) {
      // Fallback
      return Buffer.from(linkedInUrl).toString('base64').substring(0, 32);
    }
  }
  
  if (name) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(name.toLowerCase().trim());
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    } catch (e) {
      return Buffer.from(name).toString('base64').substring(0, 32);
    }
  }
  
  return null;
}

/**
 * Store account with automatic deduplication, merging, and relationship detection
 */
export async function storeAccountWithRelationships(
  accountData,
  groqQuery,
  upsertDocument,
  client,
  options = {}
) {
  const {
    autoDetectRelationships = true,
    autoMerge = true,
    autoEnrich = true,
  } = options;

  try {
    // Step 1: Check for duplicates and merge if needed
    let finalAccountData = accountData;
    let accountKey = accountData.accountKey;

    if (!accountKey) {
      const canonicalUrl = normalizeCanonicalUrl(accountData.canonicalUrl || accountData.url);
      accountKey = await generateAccountKey(canonicalUrl);
      finalAccountData.accountKey = accountKey;
      finalAccountData.canonicalUrl = canonicalUrl;
    }

    let duplicateCheck = null;

    if (autoMerge) {
      duplicateCheck = await checkAndMergeAccount(
        finalAccountData,
        groqQuery,
        client,
        upsertDocument
      );

      if (duplicateCheck.isDuplicate) {
        // Use merged account key
        accountKey = duplicateCheck.mergedAccountKey;
        finalAccountData = duplicateCheck.account;

        // Log merge information
        if (duplicateCheck.mergedFrom && duplicateCheck.mergedFrom.length > 0) {
          console.log(`Account merged: ${accountKey} merged from ${duplicateCheck.mergedFrom.join(', ')}`);
        }

        // Skip storage if account already exists and was just updated
        if (duplicateCheck.account && duplicateCheck.account._id) {
          // Account was merged, continue with relationship detection
        }
      }
    }

    // Step 2: Store/update account (normalize name/companyName for consistent display)
    const accountId = `account.${accountKey}`;
    const rawCompanyName = finalAccountData.companyName || finalAccountData.businessUnits?.companyName;
    const displayName = normalizeAccountDisplayName({
      companyName: rawCompanyName,
      name: rawCompanyName,
      domain: finalAccountData.domain || finalAccountData.rootDomain,
      rootDomain: finalAccountData.rootDomain || extractRootDomain(finalAccountData.canonicalUrl || finalAccountData.url),
      accountKey,
      _id: accountId,
    });
    const accountDoc = {
      _type: 'account',
      _id: accountId,
      accountKey,
      canonicalUrl: finalAccountData.canonicalUrl || normalizeCanonicalUrl(finalAccountData.url),
      rootDomain: finalAccountData.rootDomain || extractRootDomain(finalAccountData.canonicalUrl || finalAccountData.url),
      domain: finalAccountData.domain || finalAccountData.rootDomain || extractRootDomain(finalAccountData.canonicalUrl || finalAccountData.url),
      companyName: displayName || rawCompanyName,
      name: displayName || rawCompanyName,
      technologyStack: finalAccountData.technologyStack || finalAccountData.accountPack?.techStack || {},
      opportunityScore: finalAccountData.opportunityScore || finalAccountData.accountPack?.scan?.technologyStack?.opportunityScore || 0,
      aiReadiness: finalAccountData.aiReadiness || {},
      businessScale: finalAccountData.businessScale || {},
      businessUnits: finalAccountData.businessUnits || {},
      performance: finalAccountData.performance || {},
      signals: finalAccountData.signals || [],
      lastScannedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: finalAccountData.createdAt || new Date().toISOString(),
    };

    await upsertDocument(client, accountDoc);
    // Sanity mutate returns { transactionId?, results? }, not { success }; no throw = success

    // Step 3: Detect and store relationships
    let relationships = null;
    if (autoDetectRelationships) {
      relationships = await detectAccountRelationships(
        accountDoc,
        groqQuery,
        client,
        { limit: 10 }
      );

      await storeAccountRelationships(
        groqQuery,
        upsertDocument,
        client,
        accountKey,
        relationships
      );
    }

    // Step 4: Trigger auto-enrichment (async, don't block)
    if (autoEnrich) {
      triggerAutoEnrichment(accountKey, accountDoc, groqQuery, upsertDocument, client)
        .catch(err => console.error('Auto-enrichment error:', err));
    }

    return {
      success: true,
      accountKey,
      isDuplicate: duplicateCheck?.isDuplicate || false,
      mergedFrom: duplicateCheck?.mergedFrom || [],
      relationships,
      account: accountDoc,
    };

  } catch (error) {
    console.error('Error storing account with relationships:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Store person (LinkedIn profile) with automatic deduplication and merging
 */
export async function storePersonWithRelationships(
  personData,
  groqQuery,
  upsertDocument,
  client,
  options = {}
) {
  const {
    autoMerge = true,
    linkToAccount = true,
  } = options;

  try {
    // Generate person key
    let personKey = personData.personKey;
    if (!personKey) {
      personKey = await generatePersonKey(personData.linkedInUrl || personData.profileUrl, personData.name);
    }

    if (!personKey) {
      return { success: false, error: 'Could not generate person key' };
    }

    // Step 1: Check for duplicates and merge
    let finalPersonData = { ...personData, personKey };
    let duplicateCheck = null;

    if (autoMerge) {
      duplicateCheck = await checkAndMergePerson(
        finalPersonData,
        groqQuery,
        client,
        upsertDocument
      );

      if (duplicateCheck.isDuplicate) {
        personKey = duplicateCheck.mergedPersonKey;
        finalPersonData = duplicateCheck.person;

        if (duplicateCheck.mergedFrom && duplicateCheck.mergedFrom.length > 0) {
          console.log(`Person merged: ${personKey} merged from ${duplicateCheck.mergedFrom.join(', ')}`);
        }
      }
    }

    // Step 2: Store/update person
    const personDoc = {
      _type: 'person',
      _id: `person.${personKey}`,
      personKey,
      name: finalPersonData.name || personData.name,
      linkedInUrl: finalPersonData.linkedInUrl || personData.profileUrl || personData.linkedInUrl,
      headline: finalPersonData.headline || personData.headline,
      location: finalPersonData.location || personData.location,
      about: finalPersonData.about || personData.about,
      currentCompany: finalPersonData.currentCompany || personData.workPatterns?.currentCompany,
      currentTitle: finalPersonData.currentTitle || personData.workPatterns?.currentTitle,
      experience: finalPersonData.experience || personData.experience || [],
      education: finalPersonData.education || personData.education || [],
      skills: finalPersonData.skills || personData.skills || [],
      workPatterns: finalPersonData.workPatterns || personData.workPatterns || {},
      trajectory: finalPersonData.trajectory || personData.trajectory || {},
      network: finalPersonData.network || personData.network || {},
      connections: finalPersonData.connections || personData.connections || 0,
      followers: finalPersonData.followers || personData.followers || 0,
      scannedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: finalPersonData.createdAt || new Date().toISOString(),
    };

    await upsertDocument(client, personDoc);
    // Sanity mutate does not return { success }; no throw = success

    // Step 3: Link to account if company detected
    if (linkToAccount && personDoc.currentCompany) {
      await linkPersonToAccount(
        personKey,
        personDoc.currentCompany,
        groqQuery,
        upsertDocument,
        client
      );
    }

    return {
      success: true,
      personKey,
      isDuplicate: duplicateCheck?.isDuplicate || false,
      mergedFrom: duplicateCheck?.mergedFrom || [],
      person: personDoc,
    };

  } catch (error) {
    console.error('Error storing person with relationships:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Store search result with relationship to accounts
 */
export async function storeSearchResultWithRelationships(
  searchResult,
  groqQuery,
  upsertDocument,
  client,
  options = {}
) {
  try {
    const { query, url, title, snippet, source } = searchResult;

    // Extract potential account/company from URL
    const domain = extractRootDomain(url);
    let relatedAccountKey = null;

    if (domain) {
      // Find account by domain
      const accountQuery = `*[_type == "account" && (rootDomain == $domain || domain == $domain || canonicalUrl match "*${domain}*")][0].accountKey`;
      const accountResult = await groqQuery(client, accountQuery, { domain });
      relatedAccountKey = typeof accountResult === 'string' ? accountResult : (Array.isArray(accountResult) && accountResult[0]) || null;
    }

    // Store search result with relationship
    const searchResultDoc = {
      _type: 'searchResult',
      _id: `searchResult.${await hashString(query + url)}`,
      query,
      url,
      title,
      snippet,
      source,
      relatedAccountKey,
      searchedAt: new Date().toISOString(),
      metadata: {
        requestId: searchResult.requestId || null,
      },
    };

    await upsertDocument(client, searchResultDoc);
    // Sanity mutate does not return { success }; no throw = success

    return {
      success: true,
      searchResultId: searchResultDoc._id,
      relatedAccountKey,
    };

  } catch (error) {
    console.error('Error storing search result:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Store extract/evidence with relationship to account
 */
export async function storeEvidenceWithRelationships(
  evidenceData,
  url,
  groqQuery,
  upsertDocument,
  client
) {
  try {
    const domain = extractRootDomain(url);
    let relatedAccountKey = null;

    if (domain) {
      const accountQuery = `*[_type == "account" && (rootDomain == $domain || domain == $domain || canonicalUrl match "*${domain}*")][0].accountKey`;
      const accountResult = await groqQuery(client, accountQuery, { domain });
      relatedAccountKey = typeof accountResult === 'string' ? accountResult : (Array.isArray(accountResult) && accountResult[0]) || null;
    }

    const evidenceDoc = {
      _type: 'evidencePack',
      _id: `evidencePack.${await hashString(url)}`,
      url,
      finalUrl: evidenceData.finalUrl || url,
      title: evidenceData.title,
      siteName: evidenceData.siteName,
      fetchedAt: new Date().toISOString(),
      mainText: evidenceData.mainText,
      excerpts: evidenceData.excerpts || [],
      entities: evidenceData.entities || [],
      signals: evidenceData.signals || [],
      claims: evidenceData.claims || [],
      meta: evidenceData.meta || {},
      contentHash: evidenceData.contentHash,
      relatedAccountKey,
      metadata: {
        requestId: evidenceData.requestId || null,
      },
    };

    await upsertDocument(client, evidenceDoc);
    // Sanity mutate does not return { success }; no throw = success

    return {
      success: true,
      evidenceId: evidenceDoc._id,
      relatedAccountKey,
    };

  } catch (error) {
    console.error('Error storing evidence:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Link person to account
 */
async function linkPersonToAccount(personKey, companyName, groqQuery, upsertDocument, client) {
  try {
    // Find account by company name
    const accountQuery = `*[_type == "account" && companyName match $companyName][0]`;
    const accountResult = await groqQuery(client, accountQuery, { companyName: `*${companyName}*` });
    const account = Array.isArray(accountResult) ? accountResult[0] : accountResult;

    if (account?.accountKey) {
      
      // Update person with account reference
      const personUpdate = {
        _type: 'person',
        _id: `person.${personKey}`,
        relatedAccountKey: account.accountKey,
        updatedAt: new Date().toISOString(),
      };
      
      await upsertDocument(client, personUpdate);
      
      // Could also create a relationship document
      return { success: true, accountKey: account.accountKey };
    }
    
    return { success: false, error: 'Account not found' };
    
  } catch (error) {
    console.error('Error linking person to account:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger auto-enrichment (non-blocking)
 */
async function triggerAutoEnrichment(accountKey, accountDoc, groqQuery, upsertDocument, client) {
  try {
    // This could trigger enrichment pipeline, competitor research, etc.
    // For now, just ensure relationships are detected if not already done
    console.log(`Auto-enrichment triggered for account: ${accountKey}`);
    
    // Could queue enrichment job here
    // await queueEnrichmentJob(groqQuery, upsertDocument, client, accountDoc.canonicalUrl, accountKey);
    
  } catch (error) {
    console.error('Auto-enrichment error:', error);
  }
}

/**
 * Helper: Extract root domain from URL
 */
function extractRootDomain(url) {
  try {
    if (!url) return null;
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = urlObj.hostname.toLowerCase();
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Helper: Hash string
 */
async function hashString(str) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch {
    return Buffer.from(str).toString('base64').substring(0, 16);
  }
}

