/**
 * Deduplication and Merging Service
 * Automatically deduplicates and merges accounts and people
 */

import { normalizeDomain, normalizeCanonicalUrl } from './sanity-account.js';

/**
 * Check if account is duplicate and merge if needed
 * @param {Object} newAccountData - New account data to check
 * @param {Function} groqQuery - GROQ query function
 * @param {Object} client - Sanity client
 * @param {Function} upsertDocument - Upsert function
 * @returns {Promise<Object>} - { isDuplicate, mergedAccountKey, account }
 */
export async function checkAndMergeAccount(
  newAccountData,
  groqQuery,
  client,
  upsertDocument
) {
  try {
    const canonicalUrl = normalizeCanonicalUrl(newAccountData.canonicalUrl || newAccountData.url);
    const normalizedDomain = normalizeDomain(canonicalUrl);
    const companyName = newAccountData.companyName || newAccountData.businessUnits?.companyName;

    if (!canonicalUrl && !normalizedDomain) {
      return { isDuplicate: false, mergedAccountKey: null, account: null };
    }

    // Find potential duplicates by domain
    let duplicates = [];
    
    if (normalizedDomain) {
      const domainQuery = `*[_type == "account" && (rootDomain == $domain || domain == $domain || canonicalUrl match "*${normalizedDomain}*")] {
        _id,
        accountKey,
        canonicalUrl,
        rootDomain,
        domain,
        companyName,
        _updatedAt,
        technologyStack,
        opportunityScore,
      }`;
      
      const domainResults = await groqQuery(client, domainQuery, { domain: normalizedDomain }) || [];
      duplicates.push(...domainResults);
    }

    // Find potential duplicates by company name (if provided)
    if (companyName && companyName.length > 3) {
      const nameQuery = `*[_type == "account" && companyName match $companyName] {
        _id,
        accountKey,
        canonicalUrl,
        rootDomain,
        domain,
        companyName,
        _updatedAt,
        technologyStack,
        opportunityScore,
      }`;
      
      const nameResults = await groqQuery(client, nameQuery, { companyName: `*${companyName}*` }) || [];
      duplicates.push(...nameResults);
    }

    // Deduplicate the duplicates array
    const seen = new Set();
    duplicates = duplicates.filter(dup => {
      if (seen.has(dup.accountKey)) return false;
      seen.add(dup.accountKey);
      return true;
    });

    if (duplicates.length === 0) {
      return { isDuplicate: false, mergedAccountKey: null, account: null };
    }

    // Find the best match (most recent, most complete)
    const bestMatch = findBestMatch(duplicates, newAccountData, canonicalUrl, normalizedDomain);

    if (bestMatch) {
      // Merge data
      const mergedAccount = await mergeAccountData(bestMatch, newAccountData, groqQuery, upsertDocument, client);
      return {
        isDuplicate: true,
        mergedAccountKey: bestMatch.accountKey,
        account: mergedAccount,
        mergedFrom: duplicates.map(d => d.accountKey).filter(k => k !== bestMatch.accountKey),
      };
    }

    return { isDuplicate: false, mergedAccountKey: null, account: null };

  } catch (error) {
    console.error('Error checking account duplicate:', error);
    return { isDuplicate: false, mergedAccountKey: null, account: null, error: error.message };
  }
}

/**
 * Find best matching duplicate account
 */
function findBestMatch(duplicates, newAccountData, canonicalUrl, normalizedDomain) {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  // Score each duplicate
  const scored = duplicates.map(dup => {
    let score = 0;

    // Exact domain match
    if (normalizedDomain && (dup.rootDomain === normalizedDomain || dup.domain === normalizedDomain)) {
      score += 100;
    }

    // Exact URL match
    if (canonicalUrl && dup.canonicalUrl === canonicalUrl) {
      score += 100;
    }

    // Company name match
    const dupName = dup.companyName?.toLowerCase() || '';
    const newName = newAccountData.companyName?.toLowerCase() || newAccountData.businessUnits?.companyName?.toLowerCase() || '';
    if (newName && dupName && dupName.includes(newName) || newName.includes(dupName)) {
      score += 50;
    }

    // Most recent gets bonus
    if (dup._updatedAt) {
      const daysSinceUpdate = (Date.now() - new Date(dup._updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 30 - daysSinceUpdate); // Up to 30 points for recency
    }

    // Most complete data gets bonus
    if (dup.technologyStack && Object.keys(dup.technologyStack).length > 0) score += 20;
    if (dup.opportunityScore !== undefined && dup.opportunityScore !== null) score += 10;

    return { account: dup, score };
  });

  // Return highest scoring
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 50 ? scored[0].account : duplicates[0]; // Only merge if score > 50
}

/**
 * Merge account data intelligently
 */
async function mergeAccountData(existingAccount, newAccountData, groqQuery, upsertDocument, client) {
  try {
    // Get full existing account
    const query = `*[_type == "account" && accountKey == $accountKey][0]`;
    const existing = await groqQuery(client, query, { accountKey: existingAccount.accountKey });
    const existingFull = (existing && existing.length > 0) ? existing[0] : existingAccount;

    // Merge strategy: keep most recent/best data
    const merged = {
      ...existingFull,
      _type: 'account',
      _id: existingFull._id || `account.${existingAccount.accountKey}`,
    };

    // Update canonical URL if new one is more complete
    const newCanonicalUrl = normalizeCanonicalUrl(newAccountData.canonicalUrl || newAccountData.url);
    if (newCanonicalUrl && (!merged.canonicalUrl || newCanonicalUrl.length > merged.canonicalUrl.length)) {
      merged.canonicalUrl = newCanonicalUrl;
    }

    // Merge company name (keep longer/more specific)
    const newCompanyName = newAccountData.companyName || newAccountData.businessUnits?.companyName;
    if (newCompanyName) {
      if (!merged.companyName || newCompanyName.length > merged.companyName.length) {
        merged.companyName = newCompanyName;
      }
    }

    // Merge tech stack (merge arrays, keep unique values)
    if (newAccountData.technologyStack || newAccountData.accountPack?.techStack) {
      const newTech = newAccountData.technologyStack || newAccountData.accountPack?.techStack || {};
      const existingTech = merged.technologyStack || {};

      merged.technologyStack = {
        legacySystems: mergeArrays(existingTech.legacySystems || [], newTech.legacySystems || []),
        modernFrameworks: mergeArrays(existingTech.modernFrameworks || [], newTech.modernFrameworks || []),
        cmsSystems: mergeArrays(existingTech.cmsSystems || [], newTech.cmsSystems || []),
        // Keep other fields from most complete source
        ...(Object.keys(newTech).length > Object.keys(existingTech).length ? newTech : existingTech),
      };
    }

    // Merge opportunity score (keep higher)
    const newScore = newAccountData.opportunityScore || newAccountData.accountPack?.scan?.technologyStack?.opportunityScore;
    if (newScore !== undefined && newScore !== null) {
      if (!merged.opportunityScore || newScore > merged.opportunityScore) {
        merged.opportunityScore = newScore;
      }
    }

    // Merge other scores (keep higher)
    ['aiReadinessScore', 'performanceScore', 'digitalMaturityScore'].forEach(scoreField => {
      const newValue = newAccountData[scoreField] || newAccountData.accountPack?.scan?.[scoreField];
      if (newValue !== undefined && newValue !== null) {
        if (!merged[scoreField] || newValue > merged[scoreField]) {
          merged[scoreField] = newValue;
        }
      }
    });

    // Merge business units and scale
    if (newAccountData.businessUnits && (!merged.businessUnits || Object.keys(newAccountData.businessUnits).length > Object.keys(merged.businessUnits || {}).length)) {
      merged.businessUnits = { ...merged.businessUnits, ...newAccountData.businessUnits };
    }

    if (newAccountData.businessScale && (!merged.businessScale || Object.keys(newAccountData.businessScale).length > Object.keys(merged.businessScale || {}).length)) {
      merged.businessScale = { ...merged.businessScale, ...newAccountData.businessScale };
    }

    // Update timestamps
    merged.updatedAt = new Date().toISOString();
    if (!merged.createdAt) {
      merged.createdAt = merged.updatedAt;
    }

    // Store merged account
    await upsertDocument(client, merged);
    // Sanity mutate does not return { success }; no throw = success
    return merged;

  } catch (error) {
    console.error('Error merging account data:', error);
    return existingAccount;
  }
}

/**
 * Check if person is duplicate and merge if needed
 */
export async function checkAndMergePerson(
  newPersonData,
  groqQuery,
  client,
  upsertDocument
) {
  try {
    const linkedInUrl = newPersonData.linkedInUrl || newPersonData.profileUrl;
    const name = newPersonData.name;
    const currentCompany = newPersonData.currentCompany || newPersonData.workPatterns?.currentCompany;

    if (!linkedInUrl && !name) {
      return { isDuplicate: false, mergedPersonKey: null, person: null };
    }

    // Find potential duplicates
    let duplicates = [];

    // Find by LinkedIn URL
    if (linkedInUrl) {
      const urlQuery = `*[_type == "person" && linkedInUrl == $url] {
        _id,
        personKey,
        name,
        linkedInUrl,
        currentCompany,
        _updatedAt,
      }`;
      
      const urlResults = await groqQuery(client, urlQuery, { url: linkedInUrl }) || [];
      duplicates.push(...urlResults);
    }

    // Find by name + company
    if (name && currentCompany) {
      const nameQuery = `*[_type == "person" && name match $name && currentCompany match $company] {
        _id,
        personKey,
        name,
        linkedInUrl,
        currentCompany,
        _updatedAt,
      }`;
      
      const nameResults = await groqQuery(client, nameQuery, {
        name: `*${name}*`,
        company: `*${currentCompany}*`,
      }) || [];
      duplicates.push(...nameResults);
    }

    // Deduplicate
    const seen = new Set();
    duplicates = duplicates.filter(dup => {
      if (seen.has(dup.personKey)) return false;
      seen.add(dup.personKey);
      return true;
    });

    if (duplicates.length === 0) {
      return { isDuplicate: false, mergedPersonKey: null, person: null };
    }

    // Find best match
    const bestMatch = findBestPersonMatch(duplicates, newPersonData, linkedInUrl);

    if (bestMatch) {
      // Merge data
      const mergedPerson = await mergePersonData(bestMatch, newPersonData, groqQuery, upsertDocument, client);
      return {
        isDuplicate: true,
        mergedPersonKey: bestMatch.personKey,
        person: mergedPerson,
        mergedFrom: duplicates.map(d => d.personKey).filter(k => k !== bestMatch.personKey),
      };
    }

    return { isDuplicate: false, mergedPersonKey: null, person: null };

  } catch (error) {
    console.error('Error checking person duplicate:', error);
    return { isDuplicate: false, mergedPersonKey: null, person: null, error: error.message };
  }
}

/**
 * Find best matching duplicate person
 */
function findBestPersonMatch(duplicates, newPersonData, linkedInUrl) {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  // Score each duplicate
  const scored = duplicates.map(dup => {
    let score = 0;

    // Exact LinkedIn URL match
    if (linkedInUrl && dup.linkedInUrl === linkedInUrl) {
      score += 100;
    }

    // Name match
    const dupName = dup.name?.toLowerCase() || '';
    const newName = newPersonData.name?.toLowerCase() || '';
    if (newName && dupName && dupName === newName) {
      score += 50;
    }

    // Company match
    const dupCompany = dup.currentCompany?.toLowerCase() || '';
    const newCompany = newPersonData.currentCompany?.toLowerCase() || newPersonData.workPatterns?.currentCompany?.toLowerCase() || '';
    if (newCompany && dupCompany && dupCompany.includes(newCompany) || newCompany.includes(dupCompany)) {
      score += 30;
    }

    // Most recent gets bonus
    if (dup._updatedAt) {
      const daysSinceUpdate = (Date.now() - new Date(dup._updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 20 - daysSinceUpdate);
    }

    return { person: dup, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 50 ? scored[0].person : duplicates[0];
}

/**
 * Merge person data intelligently
 */
async function mergePersonData(existingPerson, newPersonData, groqQuery, upsertDocument, client) {
  try {
    // Get full existing person
    const query = `*[_type == "person" && personKey == $personKey][0]`;
    const existing = await groqQuery(client, query, { personKey: existingPerson.personKey });
    const existingFull = (existing && existing.length > 0) ? existing[0] : existingPerson;

    const merged = {
      ...existingFull,
      _type: 'person',
      _id: existingFull._id || `person.${existingPerson.personKey}`,
    };

    // Merge name (keep longer)
    if (newPersonData.name && (!merged.name || newPersonData.name.length > merged.name.length)) {
      merged.name = newPersonData.name;
    }

    // Merge LinkedIn URL (keep if new one is provided and existing is missing)
    if (newPersonData.linkedInUrl && !merged.linkedInUrl) {
      merged.linkedInUrl = newPersonData.linkedInUrl;
    }

    // Merge experience (merge arrays, keep unique)
    if (newPersonData.experience && Array.isArray(newPersonData.experience)) {
      merged.experience = mergePersonExperiences(merged.experience || [], newPersonData.experience);
    }

    // Merge current company/title (keep most recent)
    if (newPersonData.currentCompany) {
      merged.currentCompany = newPersonData.currentCompany;
    }
    if (newPersonData.currentTitle) {
      merged.currentTitle = newPersonData.currentTitle;
    }

    // Merge work patterns (keep most complete)
    if (newPersonData.workPatterns && (!merged.workPatterns || Object.keys(newPersonData.workPatterns).length > Object.keys(merged.workPatterns || {}).length)) {
      merged.workPatterns = { ...merged.workPatterns, ...newPersonData.workPatterns };
    }

    // Update timestamp
    merged.updatedAt = new Date().toISOString();
    if (!merged.createdAt) {
      merged.createdAt = merged.updatedAt;
    }

    // Store merged person
    await upsertDocument(client, merged);
    // Sanity mutate does not return { success }; no throw = success
    return merged;

  } catch (error) {
    console.error('Error merging person data:', error);
    return existingPerson;
  }
}

/**
 * Merge arrays, keeping unique values
 */
function mergeArrays(arr1, arr2) {
  const combined = [...arr1, ...arr2];
  return [...new Set(combined.map(item => typeof item === 'string' ? item.trim() : item))]
    .filter(Boolean);
}

/**
 * Merge person experiences, avoiding duplicates
 */
function mergePersonExperiences(existing, newExperiences) {
  const seen = new Set();
  const merged = [...existing];

  newExperiences.forEach(exp => {
    const key = `${exp.company || ''}-${exp.title || ''}-${exp.startDate || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(exp);
    }
  });

  // Sort by date (most recent first)
  return merged.sort((a, b) => {
    const dateA = a.endDate || a.startDate || '';
    const dateB = b.endDate || b.startDate || '';
    return dateB.localeCompare(dateA);
  });
}

