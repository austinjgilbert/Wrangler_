/**
 * Entity resolver:
 * - parse domains + LinkedIn URLs
 * - match to account/person
 * - create placeholders with needs_enrichment flag
 */

import {
  findAccountByDomain,
  findAccountByName,
  findPersonByLinkedinUrl,
  findPersonByName,
  upsertAccountPlaceholder,
  upsertPersonPlaceholder,
} from './sanity.ts';

const DOMAIN_REGEX = /(?:https?:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const LINKEDIN_REGEX = /https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/g;

function extractDomains(text: string): string[] {
  const matches = Array.from(text.matchAll(DOMAIN_REGEX)).map((m) => m[1]?.toLowerCase());
  return Array.from(new Set(matches.filter(Boolean)));
}

function extractLinkedInUrls(text: string): string[] {
  const matches = text.match(LINKEDIN_REGEX) || [];
  return Array.from(new Set(matches));
}

function extractNames(text: string): string[] {
  // Simple heuristic: "to Jane Doe" or "with Jane Doe"
  const matches = text.match(/\b(to|with)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g) || [];
  return matches.map((m) => m.replace(/\b(to|with)\s+/, '').trim());
}

export async function resolveEntities({
  env,
  text,
  entityHints,
}: {
  env: any;
  text: string;
  entityHints?: string[];
}) {
  const domains = extractDomains(text);
  const linkedinUrls = extractLinkedInUrls(text);
  const names = extractNames(text);
  const hints = Array.isArray(entityHints) ? entityHints : [];

  const resolved: Array<{ _type: 'reference'; _ref: string; entityType: string }> = [];

  for (const domain of domains) {
    let account = await findAccountByDomain(env, domain);
    if (!account) {
      account = await upsertAccountPlaceholder(env, domain);
    }
    resolved.push({ _type: 'reference', _ref: account._id, entityType: 'account' });
  }

  for (const url of linkedinUrls) {
    let person = await findPersonByLinkedinUrl(env, url);
    if (!person) {
      person = await upsertPersonPlaceholder(env, { linkedinUrl: url });
    }
    resolved.push({ _type: 'reference', _ref: person._id, entityType: 'person' });
  }

  for (const name of [...names, ...hints]) {
    let person = await findPersonByName(env, name);
    if (!person) {
      person = await upsertPersonPlaceholder(env, { name });
    }
    resolved.push({ _type: 'reference', _ref: person._id, entityType: 'person' });
  }

  for (const hint of hints) {
    let account = await findAccountByName(env, hint);
    if (account) {
      resolved.push({ _type: 'reference', _ref: account._id, entityType: 'account' });
    }
  }

  // Deduplicate by _ref
  const seen = new Set<string>();
  return resolved.filter((r) => {
    if (seen.has(r._ref)) return false;
    seen.add(r._ref);
    return true;
  });
}
