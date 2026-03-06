/**
 * Autonomous Enrichment Service
 * Detects entities from user prompts and enriches in background.
 */

import { extractQueryPatterns } from './learning-service.js';
import { buildPromptFromRequest, readJsonBody } from './usage-utils.js';

const PERSON_STOPWORDS = new Set(['Inc', 'LLC', 'Ltd', 'Corp', 'Corporation', 'Company', 'Co']);

function extractDomains(text) {
  if (!text) return [];
  const matches = text.match(/\b([a-z0-9-]+\.[a-z]{2,})(?:\/[^\s]*)?\b/gi) || [];
  return Array.from(new Set(matches.map(match => match.toLowerCase().replace(/\/.*$/, ''))));
}

function extractLinkedInProfiles(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/gi) || [];
  return Array.from(new Set(matches.map(url => url.replace(/[),.]+$/, ''))));
}

function extractPersonNames(text) {
  if (!text) return [];
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g) || [];
  const filtered = matches.filter(name => {
    const parts = name.split(' ');
    if (parts.some(part => PERSON_STOPWORDS.has(part))) return false;
    return parts.length >= 2;
  });
  return Array.from(new Set(filtered));
}

function extractCompanyNames(patterns, text) {
  const fromPatterns = (patterns?.entities || [])
    .filter(entity => entity.type === 'company')
    .map(entity => entity.value);

  const suffixMatches = text
    ? text.match(/\b([A-Z][A-Za-z&\-.]+(?:\s+[A-Z][A-Za-z&\-.]+){0,3}\s+(Inc|LLC|Ltd|Corp|Corporation|Company|Co))\b/g)
    : [];

  return Array.from(new Set([...(fromPatterns || []), ...(suffixMatches || [])])).filter(Boolean);
}

function isStale(lastScannedAt, days = 90) {
  if (!lastScannedAt) return true;
  const last = new Date(lastScannedAt).getTime();
  if (!Number.isFinite(last)) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return last < cutoff;
}

async function resolveAccountByDomain(client, groqQuery, domain) {
  const { quickAccountExists } = await import('./sanity-quick-query.js');
  return await quickAccountExists(client, groqQuery, domain);
}

async function resolveAccountByName(client, groqQuery, companyName) {
  const { quickSearchAccounts } = await import('./sanity-quick-query.js');
  const results = await quickSearchAccounts(client, groqQuery, companyName, { limit: 1 });
  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

async function resolveCanonicalUrl({
  companyName,
  domain,
  groqQuery,
  client,
  searchProvider,
}) {
  if (domain) return `https://${domain.replace(/^www\./, '')}`;

  if (companyName) {
    const existing = await resolveAccountByName(client, groqQuery, companyName);
    if (existing?.canonicalUrl) return existing.canonicalUrl;
  }

  if (companyName && typeof searchProvider === 'function') {
    try {
      const results = await searchProvider(`${companyName} official website`, 3);
      const candidate = results?.find(result => result?.url)?.url || null;
      if (candidate) return candidate;
    } catch (error) {
      console.warn('Autonomous enrichment search failed:', error.message);
    }
  }

  return null;
}

async function shouldEnrichAccount(client, groqQuery, accountKey, domain, refreshIfStale) {
  if (!accountKey && !domain) return true;
  const existing = accountKey
    ? await resolveAccountByDomain(client, groqQuery, accountKey)
    : await resolveAccountByDomain(client, groqQuery, domain);
  if (!existing) return true;
  if (!refreshIfStale) return false;
  return isStale(existing.lastScannedAt, 90);
}

async function enrichAccount({
  canonicalUrl,
  accountKey,
  companyName,
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  handlers,
  env,
  requestId,
  flags,
}) {
  if (!canonicalUrl) return null;

  const { autoEnrichAccount } = await import('./enrichment-service.js');
  const { autoAdvanceEnrichment } = await import('./enrichment-scheduler.js');
  const { generateAccountKey } = await import('./sanity-account.js');

  const key = accountKey || await generateAccountKey(canonicalUrl);

  const result = await autoEnrichAccount(groqQuery, upsertDocument, client, key, canonicalUrl);

  if (flags?.autoAdvance !== false && key) {
    autoAdvanceEnrichment(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      key,
      handlers,
      env,
      requestId
    ).catch(() => {});
  }

  return {
    accountKey: key,
    canonicalUrl,
    companyName,
    jobId: result.jobId || null,
    status: result.status || null,
    message: result.message || null,
  };
}

async function enrichPerson({
  name,
  profileUrl,
  companyName,
  companyDomain,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  env,
  requestId,
  internalFunctions,
  flags,
}) {
  if (!name || (!profileUrl && !companyName && !companyDomain)) {
    return null;
  }

  if (flags?.autoEnrich === false) return null;

  const { handlePersonBrief } = await import('../handlers/person-intelligence.js');
  const body = {
    name,
    profileUrl,
    companyName,
    companyDomain,
    mode: 'fast',
    store: true,
    verify: flags?.verifyClaims !== false,
  };

  const request = new Request('https://worker/person/brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const response = await handlePersonBrief(
      request,
      requestId,
      env,
      groqQuery,
      upsertDocument,
      patchDocument,
      assertSanityConfigured,
      internalFunctions
    );
    const data = await response.json().catch(() => null);
    return data?.data || null;
  } catch (error) {
    console.error('Autonomous person enrichment failed:', error);
    return null;
  }
}

// Simple dedup cache — keyed by domain+path, tracks last-stored timestamp.
// Resets when the isolate recycles (acceptable for CF Workers).
const recentStoreCache = new Map();
const DEDUP_WINDOW_MS = 30_000;

/**
 * Extract a concise textual summary from a raw API response.
 * Avoids storing raw HTML/JSON blobs in interaction records.
 */
function summarizeResponse(responseText, path) {
  if (!responseText || responseText.length < 50) return responseText || '';

  try {
    const parsed = JSON.parse(responseText);
    const data = parsed.data || parsed;

    const parts = [];

    // Scan results
    if (data.technologyStack) {
      const ts = data.technologyStack;
      const allTechs = ts.allDetected || [];
      if (allTechs.length) {
        parts.push(`Tech detected: ${allTechs.map(t => t.name).join(', ')}`);
      }
      if (ts.opportunityScore) parts.push(`Opportunity score: ${ts.opportunityScore}`);
    }

    // Brief results
    if (data.executiveSummary) {
      const summary = Array.isArray(data.executiveSummary)
        ? data.executiveSummary.join('. ')
        : String(data.executiveSummary);
      parts.push(`Brief: ${summary.slice(0, 500)}`);
    }

    // Context/query results
    if (data.summary && typeof data.summary === 'string') {
      parts.push(data.summary.slice(0, 500));
    }

    // Research results
    if (data.researchSet?.summary) {
      const rs = data.researchSet.summary;
      parts.push(`Research: ${rs.pagesDiscovered || 0} pages, brief: ${rs.hasBrief ? 'yes' : 'no'}`);
    }

    // Person brief
    if (data.name && data.currentTitle) {
      parts.push(`Person: ${data.name} - ${data.currentTitle}`);
    }

    // Search results
    if (Array.isArray(data.results)) {
      parts.push(`${data.results.length} results returned`);
    }

    // Store results
    if (data.stored || data.created) {
      parts.push(`Data stored successfully`);
    }

    // Interactions list
    if (data.interactions && Array.isArray(data.interactions)) {
      parts.push(`${data.interactions.length} interactions returned`);
    }

    // Generic success/failure
    if (parts.length === 0) {
      if (parsed.ok === true) parts.push(`Request succeeded (${path})`);
      else if (parsed.ok === false) parts.push(`Request failed: ${parsed.error?.message || 'unknown error'}`);
    }

    if (parts.length > 0) return parts.join('. ');
  } catch {
    // Not valid JSON — store a truncated version of the text
  }

  return responseText.length > 2000
    ? responseText.substring(0, 2000) + '... [truncated]'
    : responseText;
}

/**
 * Auto-store every GPT interaction to Sanity so the knowledge base grows.
 * Runs in ctx.waitUntil after every request — no opt-in needed.
 */
async function autoStoreInteraction({
  prompt,
  responseText,
  domains,
  companyNames,
  requestId,
  url,
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
}) {
  if (!prompt || !responseText) return null;

  // Skip non-informational responses (health checks, static assets, errors, etc.)
  const path = url?.pathname || '';
  const skipPaths = ['/health', '/ready', '/favicon', '/robots.txt', '/openapi'];
  if (skipPaths.some(p => path.startsWith(p))) return null;

  // Skip very short responses that are just status confirmations
  if (responseText.length < 50) return null;

  // Dedup: skip if we stored for same domain+path in the last 30s
  const dedupKey = `${domains[0] || 'none'}:${path}`;
  const lastStored = recentStoreCache.get(dedupKey);
  if (lastStored && (Date.now() - lastStored) < DEDUP_WINDOW_MS) return null;
  recentStoreCache.set(dedupKey, Date.now());
  // Prune cache to prevent unbounded growth
  if (recentStoreCache.size > 200) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
    for (const [k, v] of recentStoreCache) {
      if (v < cutoff) recentStoreCache.delete(k);
    }
  }

  try {
    const { storeInteraction } = await import('./interaction-storage.js');
    const primaryDomain = domains[0] || '';
    const { generateAccountKey } = await import('./sanity-account.js');
    const accountKey = primaryDomain ? await generateAccountKey(`https://${primaryDomain}`) : '';

    const contextTags = [];
    if (path.includes('brief')) contextTags.push('brief');
    if (path.includes('research')) contextTags.push('research');
    if (path.includes('scan')) contextTags.push('scan');
    if (path.includes('enrich')) contextTags.push('enrichment');
    if (path.includes('person')) contextTags.push('person');
    if (path.includes('linkedin')) contextTags.push('linkedin');
    if (path.includes('competitor')) contextTags.push('competitor');
    if (path.includes('osint')) contextTags.push('osint');
    if (path.includes('store')) contextTags.push('store');
    if (path.includes('query')) contextTags.push('query');
    if (path.includes('search')) contextTags.push('search');
    if (path.includes('orchestrate')) contextTags.push('orchestrate');

    // Build a concise response summary for storage (not raw JSON/HTML)
    const truncatedResponse = summarizeResponse(responseText, path);

    const result = await storeInteraction(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      {
        userPrompt: prompt,
        gptResponse: truncatedResponse,
        domain: primaryDomain,
        accountKey,
        contextTags,
        requestId,
        importance: domains.length > 0 ? 0.7 : 0.4,
      }
    );

    return result;
  } catch (err) {
    console.error('[autoStoreInteraction] failed:', err?.message);
    return null;
  }
}

export async function runAutonomousEnrichment({
  request,
  url,
  env,
  requestId,
  handlers,
  internalFunctions,
  flags = {},
  responseText = '',
}) {
  try {
    const prompt = await buildPromptFromRequest(request, url);
    if (!prompt) return null;

    const { initSanityClient, groqQuery, upsertDocument, patchDocument, assertSanityConfigured } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) return null;

    const body = await readJsonBody(request);
    const finalFlags = {
      autoEnrich: body?.auto_enrich ?? body?.autoEnrich ?? flags.autoEnrich ?? true,
      refreshIfStale: body?.refresh_if_stale ?? body?.refreshIfStale ?? flags.refreshIfStale ?? true,
      verifyClaims: body?.verify_claims ?? body?.verifyClaims ?? flags.verifyClaims ?? true,
      autoAdvance: body?.auto_advance ?? body?.autoAdvance ?? flags.autoAdvance ?? true,
    };

    const patterns = extractQueryPatterns(prompt, {});
    const domains = extractDomains(prompt);
    const linkedInUrls = extractLinkedInProfiles(prompt);
    const personNames = extractPersonNames(prompt);
    const companyNames = extractCompanyNames(patterns, prompt);

    // Auto-store every interaction (independent of enrichment flags)
    await autoStoreInteraction({
      prompt,
      responseText,
      domains,
      companyNames,
      requestId,
      url,
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
    });

    if (finalFlags.autoEnrich === false) {
      return null;
    }

    const searchProvider = internalFunctions?.searchProvider || handlers?.searchProvider || null;

    const accountTargets = [];
    if (domains.length > 0) {
      accountTargets.push(...domains.map(domain => ({ domain })));
    }

    for (const companyName of companyNames) {
      if (!accountTargets.some(target => target.companyName === companyName)) {
        accountTargets.push({ companyName });
      }
    }

    if (accountTargets.length === 0 && personNames.length === 0 && linkedInUrls.length === 0) {
      return null;
    }

    const enrichResults = {
      accounts: [],
      persons: [],
    };

    for (const target of accountTargets.slice(0, 3)) {
      const canonicalUrl = await resolveCanonicalUrl({
        companyName: target.companyName,
        domain: target.domain,
        groqQuery,
        client,
        searchProvider,
      });
      const accountKey = target.domain
        ? (await resolveAccountByDomain(client, groqQuery, target.domain))?.accountKey
        : null;

      const shouldEnrich = await shouldEnrichAccount(client, groqQuery, accountKey, target.domain, finalFlags.refreshIfStale);
      if (!shouldEnrich) continue;

      const result = await enrichAccount({
        canonicalUrl,
        accountKey,
        companyName: target.companyName || null,
        groqQuery,
        upsertDocument,
        patchDocument,
        client,
        handlers,
        env,
        requestId,
        flags: finalFlags,
      });

      if (result) enrichResults.accounts.push(result);
    }

    for (const name of personNames.slice(0, 2)) {
      const profileUrl = linkedInUrls.find(url => url.toLowerCase().includes(name.toLowerCase().split(' ')[0])) || linkedInUrls[0] || null;
      const companyName = companyNames[0] || null;
      const companyDomain = domains[0] || null;

      const personResult = await enrichPerson({
        name,
        profileUrl,
        companyName,
        companyDomain,
        groqQuery,
        upsertDocument,
        patchDocument,
        assertSanityConfigured,
        env,
        requestId,
        internalFunctions,
        flags: finalFlags,
      });

      if (personResult) enrichResults.persons.push(personResult);
    }

    return enrichResults;
  } catch (error) {
    console.error('Autonomous enrichment failed:', error);
    return null;
  }
}
