/**
 * Sanity Storage Service
 * Handles storage of account data with deduplication
 * 
 * This service wraps the account deduplication logic and ensures
 * all stored data is linked to the correct master account.
 */

import {
  findOrCreateMasterAccount,
  normalizeDomain,
} from './sanity-account.js';
import { buildPayloadIndex, hydratePayload } from '../lib/payload-helpers.js';

/**
 * Store account pack with deduplication
 * Ensures account exists and is deduplicated before storing pack
 * 
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {Function} getDocument - Get document function
 * @param {Function} mutate - Mutate function
 * @param {object} client - Sanity client
 * @param {string} canonicalUrl - Canonical URL
 * @param {string} type - Data type (scan, linkedin, evidence, brief)
 * @param {object} data - Data to store
 * @param {string} companyName - Company name (optional)
 * @param {object} scanData - Full scan data (optional, for account summary)
 * @param {object} meta - Metadata (optional)
 * @returns {Promise<{success: boolean, accountKey: string, accountId: string, packId: string, isNew: boolean, merged: boolean}>}
 */
export async function storeAccountPackWithDeduplication(
  groqQuery,
  upsertDocument,
  patchDocument,
  getDocument,
  mutate,
  client,
  canonicalUrl,
  type,
  data,
  companyName = null,
  scanData = null,
  meta = {}
) {
  // Step 1: Find or create master account (with deduplication)
  const accountResult = await findOrCreateMasterAccount(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    canonicalUrl,
    companyName,
    scanData
  );
  
  const { accountKey, accountId, isNew: accountIsNew, merged } = accountResult;
  
  // Step 2: Store account pack using the master accountKey
  const packId = `accountPack-${accountKey}`;
  const existing = await getDocument(client, packId);
  
  const now = new Date().toISOString();
  const payloadUpdate = {};
  payloadUpdate[type] = data;
  
  const hasExisting = !!(existing && typeof existing === 'object' && !Array.isArray(existing));
  
  if (hasExisting) {
    // Update existing pack
    const currentPayload = hydratePayload(existing);
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
        payloadIndex: buildPayloadIndex(updatedPayload),
        payloadData: JSON.stringify(updatedPayload),
        updatedAt: now,
        history: history,
        // Ensure accountKey matches master account
        accountKey: accountKey,
        canonicalUrl: canonicalUrl,
        domain: normalizeDomain(canonicalUrl),
      },
    });
    
    return {
      success: true,
      accountKey,
      accountId,
      packId,
      isNew: false,
      merged: merged,
    };
  } else {
    // Create new pack
    const packDoc = {
      _type: 'accountPack',
      _id: packId,
      accountKey,
      canonicalUrl,
      domain: normalizeDomain(canonicalUrl),
      createdAt: now,
      updatedAt: now,
      payloadIndex: buildPayloadIndex(payloadUpdate),
      payloadData: JSON.stringify(payloadUpdate),
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
    
    try {
      const mutations = [{ create: packDoc }];
      await mutate(client, mutations);
      return {
        success: true,
        accountKey,
        accountId,
        packId,
        isNew: true,
        merged: merged,
      };
    } catch (error) {
      // If document already exists, that's okay - we'll update it next time
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        return {
          success: true,
          accountKey,
          accountId,
          packId,
          isNew: false,
          merged: merged,
        };
      }
      // Return error but don't throw - let caller decide how to handle
      return {
        success: false,
        accountKey,
        accountId,
        packId,
        error: errorMessage,
      };
    }
  }
}

/**
 * Store brief with deduplication
 * Creates brief document linked to master account
 * 
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {Function} getDocument - Get document function
 * @param {object} client - Sanity client
 * @param {string} canonicalUrl - Canonical URL
 * @param {object} briefData - Brief data
 * @param {string} companyName - Company name (optional)
 * @returns {Promise<{success: boolean, accountKey: string, accountId: string, briefId: string}>}
 */
export async function storeBriefWithDeduplication(
  groqQuery,
  upsertDocument,
  patchDocument,
  getDocument,
  client,
  canonicalUrl,
  briefData,
  companyName = null
) {
  // Step 1: Find or create master account
  const accountResult = await findOrCreateMasterAccount(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    canonicalUrl,
    companyName,
    null // No scan data for brief-only storage
  );
  
  const { accountKey, accountId } = accountResult;
  
  // Step 2: Create brief document
  const briefId = `brief-${accountKey}-${Date.now()}`;
  const briefDoc = {
    _type: 'brief',
    _id: briefId,
    account: {
      _type: 'reference',
      _ref: accountId,
    },
    accountKey,
    canonicalUrl,
    domain: normalizeDomain(canonicalUrl),
    companyName: companyName,
    data: briefData,
    source: 'website-scanner-worker',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  try {
    await upsertDocument(client, briefDoc);
    
    return {
      success: true,
      accountKey,
      accountId,
      briefId,
    };
  } catch (error) {
    // If brief creation fails, return error but don't throw
    const errorMessage = error?.message || String(error);
    return {
      success: false,
      accountKey,
      accountId,
      briefId,
      error: errorMessage,
    };
  }
}

