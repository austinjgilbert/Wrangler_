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

    // ── 1. Process accounts ─────────────────────────────────────────────
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

        // Upsert account with captured data
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

        // Classification from CRM data
        if (acct.industry) {
          accountDoc.classification = accountDoc.classification || {};
          accountDoc.classification.industry = acct.industry;
        }

        // Benchmarks from CRM data
        if (acct.employeeCount || acct.employees || acct.revenue || acct.headquarters) {
          accountDoc.benchmarks = {
            estimatedEmployees: acct.employeeCount || acct.employees || null,
            estimatedRevenue: acct.revenue || null,
            headquarters: acct.headquarters || null,
            updatedAt: new Date().toISOString(),
          };
        }

        await upsertDocument(client, accountDoc);

        results.accountsResolved.push({
          accountKey,
          domain,
          name: acct.name || domain,
        });
      } catch (err: any) {
        console.error('Extension: account upsert error:', err?.message);
      }
    }

    // ── 2. Process people ───────────────────────────────────────────────
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

        // Classify role and seniority
        const titleStr = person.currentTitle || person.title || person.headline || '';
        personDoc.roleCategory = classifyRole(titleStr);
        personDoc.seniorityLevel = classifySeniority(titleStr);
        personDoc.isDecisionMaker = ['c-suite', 'vp', 'director'].includes(personDoc.seniorityLevel);

        // Link to account if we resolved one
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

        await upsertDocument(client, personDoc);

        results.peopleResolved.push({
          personKey,
          name: person.name,
          company: person.currentCompany || '',
        });
      } catch (err: any) {
        console.error('Extension: person upsert error:', err?.message);
      }
    }

    // ── 3. Process technologies ─────────────────────────────────────────
    const technologies = body.technologies || [];
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

        results.technologiesLinked++;
      } catch (err: any) {
        console.error('Extension: technology upsert error:', err?.message);
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
      text: `Captured from ${body.source}: ${body.title || body.url}`,
      channel: 'extension',
      actor: 'chrome_extension',
      entities,
      outcome: null,
      tags: ['extension', body.source],
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
