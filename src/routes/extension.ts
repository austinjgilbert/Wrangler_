/**
 * Chrome Extension capture route.
 *
 * POST /extension/capture
 *
 * Accepts DOM-extracted data from the Molt Capture Chrome extension
 * and pipes it into the Content OS:
 *
 *   1. Resolve entities (accounts, people) from the captured data
 *   2. Store/upsert account documents with extracted metadata
 *   3. Store/upsert person documents with LinkedIn / CRM data
 *   4. Create technology documents for detected tech
 *   5. Store a capture event (molt.event type = extension.capture)
 *   6. Trigger gap-fill enrichment for every resolved account
 *
 * Auth: Requires MOLT_API_KEY (same as /wrangler/ingest)
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { buildEventDoc } from '../lib/events.ts';
import { createMoltEvent } from '../lib/sanity.ts';

interface CapturedPerson {
  name?: string;
  headline?: string;
  title?: string;
  currentTitle?: string;
  currentCompany?: string;
  email?: string;
  phone?: string;
  location?: string;
  about?: string;
  linkedinUrl?: string;
  linkedInUrl?: string;
  experience?: any[];
  education?: any[];
  skills?: string[];
  certifications?: any[];
  publications?: any[];
  languages?: any[];
  connections?: number | string | null;
  followers?: string;
  source?: string;
}

interface CapturedAccount {
  name?: string;
  domain?: string;
  url?: string;
  website?: string;
  industry?: string;
  about?: string;
  description?: string;
  headquarters?: string;
  employeeCount?: string;
  employees?: string;
  revenue?: string;
  type?: string;
  specialties?: string[];
  linkedinUrl?: string;
  source?: string;
}

interface CapturePayload {
  url: string;
  title: string;
  source: string;
  capturedAt: string;
  people: CapturedPerson[];
  accounts: CapturedAccount[];
  technologies: string[];
  signals: any[];
  metadata: Record<string, string>;
  rawText?: string;
  /** When set (e.g. from Paste Text with a tab open), pasted tech list is applied to this URL's account */
  contextUrl?: string;
}

export async function handleExtensionCapture(request: Request, requestId: string, env: any) {
  try {
    const body: CapturePayload = await request.json();

    if (!body.url || !body.source) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url and source are required',
        {},
        400,
        requestId,
      );
    }

    const {
      initSanityClient,
      groqQuery,
      upsertDocument,
      patchDocument,
      getDocument,
      generateAccountKey,
      normalizeCanonicalUrl,
      extractDomain,
    } = await import('../sanity-client.js');

    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 500, requestId);
    }

    const results = {
      accountsResolved: [] as any[],
      peopleResolved: [] as any[],
      technologiesLinked: 0,
      signalsStored: 0,
      jobsQueued: 0,
      entitiesResolved: 0,
    };

    const pasteContext = classifyPasteContext(body);

    // ── 1. Process accounts (merge with existing when present) ───────────
    const accounts = body.accounts || [];
    for (const acct of accounts) {
      try {
        const domain = acct.domain
          || extractDomain(acct.url || acct.website || '')
          || extractDomain(body.url);
        if (!domain) continue;

        const canonicalUrl = normalizeCanonicalUrl(acct.url || acct.website || `https://${domain}`);
        const accountKey = await generateAccountKey(canonicalUrl);
        if (!accountKey) continue;

        const accountId = `account-${accountKey}`;

        const accountDoc: Record<string, any> = {
          _type: 'account',
          _id: accountId,
          accountKey,
          canonicalUrl,
          domain,
          rootDomain: extractDomain(canonicalUrl),
          updatedAt: new Date().toISOString(),
        };

        if (acct.name) accountDoc.companyName = acct.name;
        if (acct.name) accountDoc.name = acct.name;
        if (acct.industry) accountDoc.industry = acct.industry;
        if (acct.description || acct.about) {
          accountDoc.description = acct.description || acct.about;
        }
        if (acct.linkedinUrl) accountDoc.linkedinUrl = acct.linkedinUrl;
        if (acct.specialties?.length) accountDoc.specialties = acct.specialties;

        if (acct.industry) {
          accountDoc.classification = accountDoc.classification || {};
          accountDoc.classification.industry = acct.industry;
        }

        if (acct.employeeCount || acct.employees || acct.revenue || acct.headquarters) {
          accountDoc.benchmarks = {
            estimatedEmployees: acct.employeeCount || acct.employees || null,
            estimatedRevenue: acct.revenue || null,
            headquarters: acct.headquarters || null,
            updatedAt: new Date().toISOString(),
          };
        }

        const existingAccount = await getDocument(client, accountId) as Record<string, any> | null;
        const merged = mergeAccountForExtension(existingAccount, accountDoc);
        await upsertDocument(client, merged);

        results.accountsResolved.push({
          accountKey,
          domain,
          name: merged.companyName || merged.name || acct.name || domain,
        });
      } catch (err: any) {
        console.error('Extension: account upsert error:', err?.message);
      }
    }

    // ── 2. Process people (merge with existing when present) ────────────
    const people = body.people || [];
    for (const person of people) {
      try {
        if (!person.name) continue;

        const { generatePersonKey } = await import('../services/enhanced-storage-service.js');
        const personKey = await generatePersonKey(
          person.linkedinUrl || person.linkedInUrl || null,
          person.name,
        );
        if (!personKey) continue;

        const personId = `person-${personKey}`;

        const personDoc: Record<string, any> = {
          _type: 'person',
          _id: personId,
          personKey,
          name: person.name,
          updatedAt: new Date().toISOString(),
        };

        if (person.headline || person.title) personDoc.headline = person.headline || person.title;
        if (person.currentCompany) personDoc.currentCompany = person.currentCompany;
        if (person.currentTitle || person.title) personDoc.currentTitle = person.currentTitle || person.title;
        if (person.linkedinUrl || person.linkedInUrl) {
          personDoc.linkedinUrl = person.linkedinUrl || person.linkedInUrl;
          personDoc.linkedInUrl = person.linkedinUrl || person.linkedInUrl;
        }
        if (person.location) personDoc.location = person.location;
        if (person.about) personDoc.about = person.about.substring(0, 2000);
        if (person.experience?.length) personDoc.experience = person.experience;
        if (person.education?.length) personDoc.education = person.education;
        if (person.skills?.length) personDoc.skills = person.skills;
        if (person.certifications?.length) personDoc.certifications = person.certifications;
        if (person.publications?.length) personDoc.publications = person.publications;
        if (person.languages?.length) personDoc.languages = person.languages;
        if (person.connections != null) personDoc.connections = typeof person.connections === 'number' ? person.connections : parseInt(String(person.connections), 10) || null;
        if (person.email) personDoc.email = person.email;

        const titleStr = person.currentTitle || person.title || person.headline || '';
        personDoc.roleCategory = classifyRole(titleStr);
        personDoc.seniorityLevel = classifySeniority(titleStr);
        personDoc.isDecisionMaker = ['c-suite', 'vp', 'director'].includes(personDoc.seniorityLevel);

        if (person.currentCompany) {
          const matchedAccount = results.accountsResolved.find(
            a => a.name?.toLowerCase() === person.currentCompany?.toLowerCase()
              || a.domain?.includes(person.currentCompany?.toLowerCase().replace(/\s+/g, '')),
          );
          if (matchedAccount) {
            personDoc.relatedAccountKey = matchedAccount.accountKey;
            personDoc.rootDomain = matchedAccount.domain;
          }
        }

        const existingPerson = await getDocument(client, personId) as Record<string, any> | null;
        const merged = mergePersonForExtension(existingPerson, personDoc);
        await upsertDocument(client, merged);

        results.peopleResolved.push({
          personKey,
          name: merged.name || person.name,
          company: merged.currentCompany || person.currentCompany || '',
        });
      } catch (err: any) {
        console.error('Extension: person upsert error:', err?.message);
      }
    }

    // ── 3. Process technologies ─────────────────────────────────────────
    const technologies = body.technologies || [];
    const techRefsCreated: { _ref: string; _key: string }[] = [];
    for (const tech of technologies) {
      try {
        const name = typeof tech === 'string' ? tech : (tech as any).name;
        if (!name) continue;

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const techId = `technology-${slug}`;

        await upsertDocument(client, {
          _type: 'technology',
          _id: techId,
          name,
          slug,
          category: 'detected',
          lastEnrichedAt: new Date().toISOString(),
        });

        techRefsCreated.push({ _ref: techId, _key: slug });
        results.technologiesLinked++;
      } catch (err: any) {
        console.error('Extension: technology upsert error:', err?.message);
      }
    }

    // ── 3b. Text-paste with contextUrl + technologies → attach tech list to that URL's account ──
    if (
      body.source === 'text_paste' &&
      body.contextUrl &&
      body.contextUrl.startsWith('http') &&
      techRefsCreated.length > 0
    ) {
      try {
        const canonicalUrl = normalizeCanonicalUrl(body.contextUrl);
        const domain = extractDomain(body.contextUrl);
        if (canonicalUrl && domain) {
          const contextAccountKey = await generateAccountKey(canonicalUrl);
          if (contextAccountKey) {
            const contextAccountId = `account-${contextAccountKey}`;
            const existingAccount = await getDocument(client, contextAccountId) as Record<string, any> | null;
            const existingRefs = (existingAccount?.technologies || []).map((r: { _ref?: string }) => ({ _ref: r._ref || r, _key: (r._ref || r).toString().replace('technology-', '') }));
            const seen = new Set(existingRefs.map((r: { _ref: string }) => r._ref));
            for (const r of techRefsCreated) {
              if (!seen.has(r._ref)) {
                existingRefs.push(r);
                seen.add(r._ref);
              }
            }
            const techRefsSanity = existingRefs.map((r: { _ref: string; _key: string }) => ({
              _type: 'reference' as const,
              _ref: r._ref,
              _key: r._key,
            }));

            const minimalAccount: Record<string, any> = {
              _type: 'account',
              _id: contextAccountId,
              accountKey: contextAccountKey,
              canonicalUrl,
              domain,
              rootDomain: domain,
              updatedAt: new Date().toISOString(),
            };
            const mergedAccount = mergeAccountForExtension(existingAccount, minimalAccount);
            mergedAccount.technologies = techRefsSanity;
            await upsertDocument(client, mergedAccount);

            if (!results.accountsResolved.some((a) => a.accountKey === contextAccountKey)) {
              results.accountsResolved.push({
                accountKey: contextAccountKey,
                domain,
                name: domain,
              });
            }
          }
        }
      } catch (err: any) {
        console.error('Extension: contextUrl tech link error:', err?.message);
      }
    }

    // ── 4. Store capture event ──────────────────────────────────────────
    const entities = [
      ...results.accountsResolved.map(a => ({
        _ref: `account-${a.accountKey}`,
        entityType: 'account' as const,
      })),
      ...results.peopleResolved.map(p => ({
        _ref: `person-${p.personKey}`,
        entityType: 'person' as const,
      })),
    ];

    const eventDoc = buildEventDoc({
      type: 'extension.capture',
      text: `Captured from ${body.source}: ${body.title || body.url}${pasteContext !== 'capture' ? ` (${pasteContext})` : ''}`,
      channel: 'extension',
      actor: 'chrome_extension',
      entities,
      outcome: null,
      tags: ['extension', body.source, pasteContext],
      traceId: requestId,
      idempotencyKey: `ext.${(body.capturedAt || new Date().toISOString()).replace(/[^a-zA-Z0-9]/g, '')}`,
    });

    await createMoltEvent(env, eventDoc);

    // ── 5. Trigger gap-fill enrichment for every resolved account ────────
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
    for (const acct of results.accountsResolved) {
      triggerGapFill({
        env,
        accountKey: acct.accountKey,
        domain: acct.domain,
        trigger: 'extension',
      }).catch(() => {});
      results.jobsQueued++;
    }

    results.entitiesResolved = results.accountsResolved.length + results.peopleResolved.length;

    return createSuccessResponse(
      {
        source: body.source,
        url: body.url,
        accountsResolved: results.accountsResolved.length,
        peopleResolved: results.peopleResolved.length,
        technologiesLinked: results.technologiesLinked,
        entitiesResolved: results.entitiesResolved,
        jobsQueued: results.jobsQueued,
        eventId: eventDoc._id,
        backgroundEnrichment: true,
      },
      requestId,
    );
  } catch (error: any) {
    return createErrorResponse('EXTENSION_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function classifyRole(title: string): string {
  const t = (title || '').toLowerCase();
  if (/cto|vp.*eng|head.*eng|director.*eng|software|developer|architect|devops|sre/i.test(t)) return 'engineering';
  if (/cmo|vp.*market|head.*market|director.*market|growth|brand|content.*lead/i.test(t)) return 'marketing';
  if (/cpo|vp.*product|head.*product|director.*product|product.*lead|digital.*lead|ux/i.test(t)) return 'digital-product';
  if (/ciso|vp.*security|head.*security|it.*director/i.test(t)) return 'it-security';
  if (/ceo|coo|cfo|president|founder|partner|managing director/i.test(t)) return 'executive';
  if (/vp.*sales|head.*sales|director.*sales|revenue|business development/i.test(t)) return 'sales';
  return 'other';
}

function classifySeniority(title: string): string {
  const t = (title || '').toLowerCase();
  if (/\bc[a-z]o\b|chief|president|founder|co-founder|partner/i.test(t)) return 'c-suite';
  if (/\bvp\b|vice president|svp|evp/i.test(t)) return 'vp';
  if (/director|head of/i.test(t)) return 'director';
  if (/manager|lead|principal|senior/i.test(t)) return 'manager';
  return 'ic';
}

/** Infer paste context for sorting/storing (tech_list, people_list, accounts, mixed) */
function classifyPasteContext(body: CapturePayload): string {
  if (body.source !== 'text_paste') return 'capture';
  const t = (body.technologies || []).length;
  const p = (body.people || []).length;
  const a = (body.accounts || []).length;
  const raw = (body.rawText || '').trim();
  if (t > 0 && p === 0 && a === 0) return 'tech_list';
  if (p > 0 && t === 0 && a === 0) return 'people_list';
  if (a > 0 && t === 0 && p === 0) return 'accounts';
  if (t > 0 || p > 0 || a > 0) return 'mixed';
  if (raw.length > 50 && /@|\.com|company|tech|stack|react|salesforce/i.test(raw)) return 'general';
  return 'snippet';
}

/** Best-value merge: prefer non-empty, longer string; merge arrays (union); merge objects by key */
function bestString(existing: string | null | undefined, incoming: string | null | undefined): string | undefined {
  if (incoming == null || incoming === '') return existing ?? undefined;
  if (existing == null || existing === '') return incoming;
  return incoming.length >= existing.length ? incoming : existing;
}

function mergeAccountForExtension(existing: Record<string, any> | null, incoming: Record<string, any>): Record<string, any> {
  const out = { ...incoming };
  if (!existing) return out;
  for (const k of ['companyName', 'name', 'domain', 'industry', 'description', 'linkedinUrl', 'canonicalUrl']) {
    if (out[k] != null && out[k] !== '') continue;
    if (existing[k] != null && existing[k] !== '') out[k] = existing[k];
  }
  if (Array.isArray(existing.specialties) && existing.specialties.length) {
    const combined = [...new Set([...(out.specialties || []), ...existing.specialties])];
    out.specialties = combined;
  }
  if (existing.benchmarks && typeof existing.benchmarks === 'object') {
    out.benchmarks = {
      ...existing.benchmarks,
      ...(out.benchmarks || {}),
      updatedAt: new Date().toISOString(),
    };
    for (const key of Object.keys(out.benchmarks)) {
      if (out.benchmarks[key] == null && existing.benchmarks[key] != null) out.benchmarks[key] = existing.benchmarks[key];
    }
  }
  if (existing.classification && typeof existing.classification === 'object') {
    out.classification = { ...existing.classification, ...(out.classification || {}) };
  }
  return out;
}

function mergePersonForExtension(existing: Record<string, any> | null, incoming: Record<string, any>): Record<string, any> {
  const out = { ...incoming };
  if (!existing) return out;
  for (const k of ['name', 'headline', 'currentCompany', 'currentTitle', 'linkedinUrl', 'email', 'location', 'about']) {
    if (out[k] != null && out[k] !== '') continue;
    if (existing[k] != null && existing[k] !== '') out[k] = existing[k];
  }
  if (Array.isArray(existing.skills) && existing.skills.length) {
    const combined = [...new Set([...(out.skills || []), ...existing.skills])];
    out.skills = combined;
  }
  if (Array.isArray(existing.experience) && existing.experience.length && !(out.experience?.length)) out.experience = existing.experience;
  if (Array.isArray(existing.education) && existing.education.length && !(out.education?.length)) out.education = existing.education;
  return out;
}
