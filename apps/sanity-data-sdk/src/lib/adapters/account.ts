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
 * Account shape from /operator/console/snapshot → data.entities.accounts.
 * The snapshot handler transforms raw Sanity docs into this presentation shape.
 * See: src/routes/operatorConsole.ts lines 431-442.
 */
export interface SnapshotAccount {
  id: string;
  accountKey: string;
  name: string;
  domain: string | null;
  canonicalUrl: string | null;
  completion: number;
  opportunityScore: number;
  missing: string[];
  nextStages: string[];
  technologies: string[];
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
 * Transform a snapshot account (from /operator/console/snapshot) into the UI Account type.
 */
export function transformSnapshotAccount(snap: SnapshotAccount): Account {
  if (!snap.accountKey) {
    throw new Error(`transformSnapshotAccount: missing accountKey on ${snap.id}`);
  }

  const score = snap.opportunityScore ?? 0;

  return {
    _id: snap.id,
    accountKey: snap.accountKey,
    companyName: snap.name || snap.domain || 'Unknown',
    canonicalUrl: snap.canonicalUrl || '',
    rootDomain: snap.domain || '',
    opportunityScore: snap.opportunityScore,
    completeness: snap.completion,
    hot: score >= HOT_THRESHOLD,
  };
}

/**
 * Transform an array of snapshot accounts, filtering out invalid ones.
 */
export function transformSnapshotAccounts(snaps: SnapshotAccount[]): Account[] {
  const accounts: Account[] = [];
  for (const snap of snaps) {
    try {
      accounts.push(transformSnapshotAccount(snap));
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
