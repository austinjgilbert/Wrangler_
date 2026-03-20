/**
 * Dedup Scanner — finds duplicate accounts and persons in Sanity.
 *
 * Accounts are grouped by normalized domain.
 * Persons are grouped by normalized LinkedIn URL, then by (name + company).
 *
 * Each group with >1 member is a "duplicate cluster" that needs merging.
 */

import { normalizeDomain } from './sanity-account.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLinkedInUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim().toLowerCase());
    // Normalize to https://www.linkedin.com/in/username (strip trailing slash, query, hash)
    let path = u.pathname.replace(/\/+$/, '');
    // Remove /overlay, /detail, etc. suffixes from profile URLs
    path = path.replace(/\/(overlay|detail|recent-activity|edit).*$/, '');
    return `https://www.linkedin.com${path}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function normalizeNameKey(name, company) {
  if (!name) return null;
  const n = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const c = (company || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!n) return null;
  return `${n}|${c}`;
}

/**
 * Score an account for "completeness" — higher = better candidate to be the winner.
 */
function scoreAccount(account) {
  let score = 0;
  if (account.companyName) score += 10;
  if (account.domain) score += 10;
  if (account.rootDomain) score += 5;
  if (account.canonicalUrl) score += 10;
  if (account.accountKey) score += 10;
  if (account.technologyStack && Object.keys(account.technologyStack).length > 0) score += 20;
  if (account.leadership && account.leadership.length > 0) score += 15;
  if (account.painPoints && account.painPoints.length > 0) score += 10;
  if (account.benchmarks && Object.keys(account.benchmarks).length > 0) score += 10;
  if (account.opportunityScore != null) score += 10;
  if (account.classification && Object.keys(account.classification).length > 0) score += 10;
  if (account.signals && account.signals.length > 0) score += 5;
  if (account.lastEnrichedAt) score += 15;
  if (account.lastScannedAt) score += 10;
  // Prefer non-placeholder IDs
  if (account._id && !account._id.includes('placeholder')) score += 20;
  // Recency bonus
  if (account._updatedAt) {
    const days = (Date.now() - new Date(account._updatedAt).getTime()) / 86400000;
    score += Math.max(0, Math.round(30 - days));
  }
  return score;
}

/**
 * Score a person for "completeness".
 */
function scorePerson(person) {
  let score = 0;
  if (person.name && person.name !== 'Unknown') score += 10;
  if (person.linkedInUrl || person.linkedinUrl) score += 15;
  if (person.email) score += 15;
  if (person.title || person.currentTitle) score += 10;
  if (person.currentCompany) score += 10;
  if (person.experience && person.experience.length > 0) score += 15;
  if (person.education && person.education.length > 0) score += 10;
  if (person.skills && person.skills.length > 0) score += 10;
  if (person.companyRef) score += 10;
  if (person.roleCategory) score += 5;
  if (person.seniorityLevel) score += 5;
  if (person.lastEnrichedAt) score += 15;
  // Prefer non-placeholder IDs
  if (person._id && !person._id.includes('placeholder')) score += 20;
  // Recency bonus
  if (person._updatedAt) {
    const days = (Date.now() - new Date(person._updatedAt).getTime()) / 86400000;
    score += Math.max(0, Math.round(30 - days));
  }
  return score;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan all accounts and return duplicate clusters.
 * Each cluster: { domain, winner, losers, totalDocs }
 */
export async function scanAccountDuplicates(groqQuery, client) {
  // Fetch all accounts with fields needed for matching + scoring
  const query = `*[_type == "account"] {
    _id,
    _updatedAt,
    accountKey,
    name,
    companyName,
    domain,
    rootDomain,
    canonicalUrl,
    technologyStack,
    leadership,
    painPoints,
    benchmarks,
    opportunityScore,
    classification,
    signals,
    lastEnrichedAt,
    lastScannedAt,
    createdAt,
    updatedAt
  } | order(_updatedAt desc)`;

  const accounts = await groqQuery(client, query) || [];
  if (!Array.isArray(accounts)) return { clusters: [], totalAccounts: 0, totalDuplicates: 0 };

  // Group by normalized domain
  const domainGroups = new Map();

  for (const account of accounts) {
    const domain = normalizeDomain(account.domain || account.rootDomain || account.canonicalUrl || '');
    if (!domain) continue;

    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain).push(account);
  }

  // Build clusters (only groups with >1 member)
  const clusters = [];
  let totalDuplicates = 0;

  for (const [domain, group] of domainGroups) {
    if (group.length <= 1) continue;

    // Score each account, pick winner
    const scored = group.map(a => ({ account: a, score: scoreAccount(a) }));
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0].account;
    const losers = scored.slice(1).map(s => s.account);
    totalDuplicates += losers.length;

    clusters.push({
      domain,
      matchType: 'domain',
      winner: { _id: winner._id, accountKey: winner.accountKey, name: winner.companyName || winner.name, score: scored[0].score },
      losers: losers.map((l, i) => ({
        _id: l._id,
        accountKey: l.accountKey,
        name: l.companyName || l.name,
        score: scored[i + 1].score,
      })),
      totalDocs: group.length,
    });
  }

  // Sort clusters by size (biggest first)
  clusters.sort((a, b) => b.totalDocs - a.totalDocs);

  return {
    clusters,
    totalAccounts: accounts.length,
    totalDuplicates,
    uniqueDomains: domainGroups.size,
  };
}

/**
 * Scan all persons and return duplicate clusters.
 * Groups by LinkedIn URL first, then by name+company for those without LinkedIn.
 */
export async function scanPersonDuplicates(groqQuery, client) {
  const query = `*[_type == "person"] {
    _id,
    _updatedAt,
    personKey,
    name,
    linkedInUrl,
    linkedinUrl,
    email,
    title,
    currentTitle,
    currentCompany,
    companyRef,
    experience,
    education,
    skills,
    roleCategory,
    seniorityLevel,
    lastEnrichedAt,
    createdAt,
    updatedAt
  } | order(_updatedAt desc)`;

  const persons = await groqQuery(client, query) || [];
  if (!Array.isArray(persons)) return { clusters: [], totalPersons: 0, totalDuplicates: 0 };

  // Phase 1: Group by normalized LinkedIn URL
  const linkedinGroups = new Map();
  const noLinkedin = [];

  for (const person of persons) {
    const url = normalizeLinkedInUrl(person.linkedInUrl || person.linkedinUrl);
    if (url) {
      if (!linkedinGroups.has(url)) {
        linkedinGroups.set(url, []);
      }
      linkedinGroups.get(url).push(person);
    } else {
      noLinkedin.push(person);
    }
  }

  // Phase 2: Group remaining by name+company
  const nameGroups = new Map();
  for (const person of noLinkedin) {
    const key = normalizeNameKey(person.name, person.currentCompany);
    if (!key) continue;
    if (!nameGroups.has(key)) {
      nameGroups.set(key, []);
    }
    nameGroups.get(key).push(person);
  }

  // Build clusters
  const clusters = [];
  let totalDuplicates = 0;

  for (const [url, group] of linkedinGroups) {
    if (group.length <= 1) continue;

    const scored = group.map(p => ({ person: p, score: scorePerson(p) }));
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0].person;
    const losers = scored.slice(1).map(s => s.person);
    totalDuplicates += losers.length;

    clusters.push({
      matchKey: url,
      matchType: 'linkedin',
      winner: { _id: winner._id, personKey: winner.personKey, name: winner.name, score: scored[0].score },
      losers: losers.map((l, i) => ({
        _id: l._id,
        personKey: l.personKey,
        name: l.name,
        score: scored[i + 1].score,
      })),
      totalDocs: group.length,
    });
  }

  for (const [key, group] of nameGroups) {
    if (group.length <= 1) continue;

    const scored = group.map(p => ({ person: p, score: scorePerson(p) }));
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0].person;
    const losers = scored.slice(1).map(s => s.person);
    totalDuplicates += losers.length;

    clusters.push({
      matchKey: key,
      matchType: 'name+company',
      winner: { _id: winner._id, personKey: winner.personKey, name: winner.name, score: scored[0].score },
      losers: losers.map((l, i) => ({
        _id: l._id,
        personKey: l.personKey,
        name: l.name,
        score: scored[i + 1].score,
      })),
      totalDocs: group.length,
    });
  }

  clusters.sort((a, b) => b.totalDocs - a.totalDocs);

  return {
    clusters,
    totalPersons: persons.length,
    totalDuplicates,
    uniqueLinkedIn: linkedinGroups.size,
    uniqueNameKeys: nameGroups.size,
  };
}
