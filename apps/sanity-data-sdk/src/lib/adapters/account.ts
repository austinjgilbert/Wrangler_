/**
 * Account adapter — transforms raw Sanity account documents into UI-facing Account type.
 */

import type { Account } from './types';

const HOT_THRESHOLD = 70;

/** Raw Sanity account document shape (subset of fields we use). */
export interface SanityAccountDoc {
  _id: string;
  accountKey?: string;
  companyName?: string;
  canonicalUrl?: string;
  rootDomain?: string;
  opportunityScore?: number;
  lastScannedAt?: string;
  technologyStack?: Record<string, string[]>;
}

/**
 * Transform a raw Sanity account document into the UI Account type.
 * Fails explicitly if required fields are missing.
 */
export function transformAccount(doc: SanityAccountDoc): Account {
  if (!doc._id) {
    throw new Error(`transformAccount: missing _id`);
  }
  if (!doc.accountKey) {
    throw new Error(`transformAccount: missing accountKey on ${doc._id}`);
  }

  const score = doc.opportunityScore ?? 0;

  return {
    _id: doc._id,
    accountKey: doc.accountKey,
    companyName: doc.companyName || doc.rootDomain || 'Unknown',
    canonicalUrl: doc.canonicalUrl || '',
    rootDomain: doc.rootDomain || '',
    opportunityScore: doc.opportunityScore,
    completeness: undefined,
    hot: score >= HOT_THRESHOLD,
    lastScannedAt: doc.lastScannedAt,
    technologyStack: doc.technologyStack,
  };
}

/**
 * Transform an array of Sanity account docs, filtering out invalid ones.
 */
export function transformAccounts(docs: SanityAccountDoc[]): Account[] {
  const accounts: Account[] = [];
  for (const doc of docs) {
    try {
      accounts.push(transformAccount(doc));
    } catch (err) {
      console.warn('[adapters/account]', (err as Error).message);
    }
  }
  return accounts;
}

/**
 * Sort accounts by completeness (descending), then by opportunity score.
 */
export function sortAccountsForSelector(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    const compA = a.completeness ?? 0;
    const compB = b.completeness ?? 0;
    if (compB !== compA) return compB - compA;
    const scoreA = a.opportunityScore ?? 0;
    const scoreB = b.opportunityScore ?? 0;
    return scoreB - scoreA;
  });
}
