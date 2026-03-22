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

import { createErrorResponse, createSuccessResponse, sanitizeErrorMessage } from '../utils/response.js';
import { buildEventDoc } from '../lib/events.ts';
import { createMoltEvent } from '../lib/sanity.ts';
import { buildDeterministicSnapshotId, buildExtensionCaptureBucketId } from '../../shared/accountStoragePolicy.ts';
import { normalizeAccountDisplayName } from '../../shared/accountNameNormalizer.js';
import { categorizeTechnology, buildTechStack, mergeTechStacks } from '../utils/tech-categories.js';
import { appendContactSighting, computeContactConsensus } from '../lib/contactConsensus.js';

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
  domain?: string;
  companyName?: string;
  captureSource?: string;
  pageSource?: string;
  interaction?: {
    _type?: string;
    source?: string;
    domain?: string;
    url?: string;
    title?: string;
    companyName?: string;
    timestamp?: string;
  };
  people: CapturedPerson[];
  accounts: CapturedAccount[];
  technologies: string[];
  signals: any[];
  metadata: Record<string, string>;
  rawText?: string;
  emails?: string[];
  phones?: string[];
  headings?: string[];
  links?: Array<{ text?: string; href?: string }>;
  fingerprint?: string;
  /** When set (e.g. from Paste Text with a tab open), pasted tech list is applied to this URL's account */
  contextUrl?: string;
  learnMode?: {
    sessionId?: string;
    label?: string;
    startedAt?: string;
  };
}

export async function handleExtensionCapture(request: Request, requestId: string, env: any) {
  try {
    const { safeParseJson } = await import('../utils/response.js');
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;

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
    const { findOrCreateMasterAccount } = await import('../services/sanity-account.js');

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
    const captureUrl = body.interaction?.url || body.url;
    const captureTitle = body.interaction?.title || body.title || captureUrl;
    const captureTimestamp = body.interaction?.timestamp || body.capturedAt || new Date().toISOString();
    const captureSource = body.interaction?.source || body.captureSource || 'chrome_extension';
    const captureDomain = normalizeCapturedDomain(
      body.interaction?.domain
      || body.domain
      || extractDomain(captureUrl),
    );

    if (!captureDomain || !captureSource) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'domain and source are required',
        { url: captureUrl, source: captureSource, domain: captureDomain },
        400,
        requestId,
      );
    }

    // ── 1. Process accounts (merge with existing when present) ───────────
    const accounts = body.accounts || [];
    for (const acct of accounts) {
      try {
        const domain = acct.domain
          || extractDomain(acct.url || acct.website || '')
          || extractDomain(body.url);
        if (!domain) continue;

        const canonicalUrl = normalizeCanonicalUrl(acct.url || acct.website || `https://${domain}`);
        const resolvedAccount = await findOrCreateMasterAccount(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          canonicalUrl,
          acct.name || body.companyName || null,
          null,
        );
        const accountKey = resolvedAccount?.accountKey;
        const accountId = resolvedAccount?.accountId;
        if (!accountKey || !accountId) continue;

        const rootDomain = extractDomain(canonicalUrl);
        const displayName = normalizeAccountDisplayName({
          companyName: acct.name ?? undefined,
          name: acct.name ?? undefined,
          domain,
          rootDomain,
          accountKey,
          _id: accountId,
        });
        const accountDoc: Record<string, any> = {
          _type: 'account',
          _id: accountId,
          accountKey,
          canonicalUrl,
          domain,
          rootDomain,
          updatedAt: new Date().toISOString(),
        };

        if (displayName || acct.name) {
          accountDoc.companyName = displayName || (acct.name ?? null);
          accountDoc.name = displayName || (acct.name ?? null);
        }
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

        // P0-5: Categorize flat tech array into structured technologyStack
        const techStack = buildTechStack(body.technologies || []);
        if (Object.keys(techStack).length > 0) {
          accountDoc.technologyStack = mergeTechStacks(
            existingAccount?.technologyStack || {},
            techStack,
          );
        }

        const merged = mergeAccountForExtension(existingAccount, accountDoc);
        await upsertDocument(client, merged);

        results.accountsResolved.push({
          accountId,
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
        if (person.currentTitle || person.title) personDoc.title = person.currentTitle || person.title;
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
        if (person.source) personDoc.sourceSystems = [person.source];

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
            personDoc.companyRef = { _type: 'reference', _ref: matchedAccount.accountId };
            if (!personDoc.currentCompany) personDoc.currentCompany = matchedAccount.name || person.currentCompany;
          }
        }

        // Fetch existing person BEFORE contact logic so we seed from existing arrays
        const existingPerson = await getDocument(client, personId) as Record<string, any> | null;

        // Contact data aggregation: append sighting to EXISTING arrays, score, sync flat fields
        if (person.email) {
          personDoc.contactEmails = appendContactSighting(
            existingPerson?.contactEmails, person.email, body.source, new Date().toISOString()
          );
        }
        if (person.phone) {
          personDoc.contactPhones = appendContactSighting(
            existingPerson?.contactPhones, person.phone, body.source, new Date().toISOString()
          );
        }
        if (person.email || person.phone) {
          const consensus = computeContactConsensus({
            ...existingPerson,
            contactEmails: personDoc.contactEmails || existingPerson?.contactEmails,
            contactPhones: personDoc.contactPhones || existingPerson?.contactPhones,
          });
          personDoc.contactEmails = consensus.emails;
          personDoc.contactPhones = consensus.phones;
          personDoc.email = consensus.primaryEmail?.value || personDoc.email;
          personDoc.phone = consensus.primaryPhone?.value || personDoc.phone;
        }

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

        const category = categorizeTechnology(name);
        await upsertDocument(client, {
          _type: 'technology',
          _id: techId,
          name,
          slug,
          category,
          isLegacy: category === 'legacy',
          isMigrationTarget: category === 'migration-target',
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
            const resolvedAccount = await findOrCreateMasterAccount(
              groqQuery,
              upsertDocument,
              patchDocument,
              client,
              canonicalUrl,
              body.companyName || body.domain || null,
              null,
            );
            const contextAccountId = resolvedAccount?.accountId || `account.${contextAccountKey}`;
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
                accountId: contextAccountId,
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

    // ── 3c. Store extension interaction with normalized page metadata ──────
    const primaryResolvedAccount = results.accountsResolved[0] || null;
    const interactionId = buildExtensionCaptureBucketId({
      accountKey: primaryResolvedAccount?.accountKey || null,
      domain: captureDomain,
      date: captureTimestamp.slice(0, 10),
    });
    const interactionCompanyName = inferCapturedCompanyName(body, captureDomain)
      || primaryResolvedAccount?.name
      || null;

    const dataAdded: string[] = [];
    if (results.accountsResolved.length) dataAdded.push('account');
    if (results.peopleResolved.length) dataAdded.push('person');
    if (results.technologiesLinked) dataAdded.push('technology');
    const influencedAreas: string[] = [...new Set(dataAdded)];

    await upsertDocument(client, {
      _type: 'interaction',
      _id: `interaction.${interactionId}`,
      interactionId,
      userPrompt: `Captured page: ${captureTitle}`,
      gptResponse: `Chrome extension captured ${interactionCompanyName || captureDomain} from ${body.source || 'website'} and stored the page context for enrichment.`,
      timestamp: captureTimestamp,
      source: captureSource,
      pageSource: body.pageSource || body.source,
      domain: captureDomain,
      url: captureUrl,
      title: captureTitle,
      companyName: interactionCompanyName,
      accountKey: primaryResolvedAccount?.accountKey || '',
      contextTags: uniqueStrings(['extension', 'chrome_extension', body.source, pasteContext, captureDomain]),
      requestId,
      createdAt: captureTimestamp,
      updatedAt: new Date().toISOString(),
      eventSummary: `Extension capture from ${body.source}: ${results.accountsResolved.length} account(s), ${results.peopleResolved.length} contact(s), ${results.technologiesLinked} tech(s) linked.`,
      dataAdded: dataAdded.length ? dataAdded : undefined,
      influencedAreas: influencedAreas.length ? influencedAreas : undefined,
      userId: 'chrome_extension',
    });

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
        interactionId,
        eventId: eventDoc._id,
        backgroundEnrichment: true,
      },
      requestId,
    );
  } catch (error: any) {
    return createErrorResponse('EXTENSION_ERROR', sanitizeErrorMessage(error, 'extension/capture'), {}, 500, requestId);
  }
}

export async function handleExtensionPageIntel(request: Request, requestId: string, env: any) {
  try {
    const { safeParseJson } = await import('../utils/response.js');
    const { data: body, error } = await safeParseJson(request, requestId);
    if (error) return error;
    if (!body?.url || !body?.source) {
      return createErrorResponse('VALIDATION_ERROR', 'url and source are required', {}, 400, requestId);
    }

    const { initSanityClient } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 500, requestId);
    }

    const intel = await buildRabbitIntel(body, env, client);
    const { groqQuery: _groqQuery, ...responseData } = intel;
    return createSuccessResponse(responseData, requestId);
  } catch (error: any) {
    return createErrorResponse('EXTENSION_INTEL_ERROR', sanitizeErrorMessage(error, 'extension/page-intel'), {}, 500, requestId);
  }
}

export async function handleExtensionAsk(request: Request, requestId: string, env: any) {
  try {
    // ── Size gate: reject oversized payloads before parsing ─────────
    const { isBodyWithinSizeLimit, sanitizeExtensionPayload, stripHtmlTags } = await import('../utils/extension-sanitize.js');
    if (!isBodyWithinSizeLimit(request)) {
      return createErrorResponse('PAYLOAD_TOO_LARGE', 'Request body exceeds 50KB limit', {}, 413, requestId);
    }

    const rawBody: any = await request.json().catch(() => ({}));
    const body = sanitizeExtensionPayload(rawBody);
    const prompt = String(body?.prompt || '').trim();
    // Sanitize nested page context — array fields (headings, links, people, etc.)
    // live under body.page for /extension/ask, not at the top level.
    const page = body?.page ? sanitizeExtensionPayload(body.page) : null;
    if (!prompt) {
      return createErrorResponse('VALIDATION_ERROR', 'prompt is required', {}, 400, requestId);
    }

    const { initSanityClient, groqQuery, upsertDocument, patchDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 500, requestId);
    }

    const intel = page ? await buildRabbitIntel(page, env, client) : null;
    const { buildContextSummary } = await import('../services/context-retrieval.js');
    const contextSummary = intel?.primaryAccount?.accountKey || intel?.primaryAccount?.domain
      ? await buildContextSummary(
        intel.groqQuery,
        client,
        {
          accountKey: intel.primaryAccount?.accountKey || null,
          domain: intel.primaryAccount?.domain || null,
          fullInsights: false,
          interactionLimit: 5,
          learningLimit: 5,
          followUpLimit: 3,
        },
      )
      : 'No stored account context found for this page yet.';

    const answer = buildRabbitAnswer(prompt, intel, contextSummary);

    // ── P0-6: Store the Q&A exchange as an interaction ──────────────────
    // Fire-and-forget: don't block the response on storage success.
    // If storage fails, the user still gets their answer.
    // SECURITY: Strip HTML before storage — sanitize-on-write, not sanitize-on-read.
    const { storeInteraction } = await import('../services/interaction-storage.js');
    storeInteraction(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      {
        sessionId: body?.sessionId || null,
        userPrompt: stripHtmlTags(prompt),
        gptResponse: stripHtmlTags(answer),
        domain: intel?.primaryAccount?.domain || '',
        accountKey: intel?.primaryAccount?.accountKey || '',
        referencedAccounts: intel?.primaryAccount?._id
          ? [{ _type: 'reference', _ref: intel.primaryAccount._id }]
          : [],
        contextTags: ['extension-ask', 'rabbit'],
        requestId,
      },
    ).catch((err: any) => {
      console.error('Extension ask: interaction storage failed (non-blocking):', err?.message);
    });

    // ── Activity event: extension prompt ───────────────────────────
    const { emitActivityEvent } = await import('../lib/sanity.ts');
    emitActivityEvent(env, {
      eventType: 'prompt',
      status: 'completed',
      source: 'extension',
      accountKey: intel?.primaryAccount?.accountKey || null,
      category: 'interaction',
      message: `Prompt: "${(prompt || '').slice(0, 80)}"`,
      data: {
        promptText: prompt,
        domain: intel?.primaryAccount?.domain || null,
        accountName: intel?.primaryAccount?.companyName || null,
      },
      idempotencyKey: `ext.ask.${requestId}`,
    }).catch((err: any) => {
      console.error('Extension ask: activity event failed (non-blocking):', err?.message);
    });

    return createSuccessResponse({
      answer,
      nextActions: intel?.nextActions || [],
      opportunities: intel?.opportunities || [],
      contacts: intel?.contacts || [],
      primaryAccount: intel?.primaryAccount || null,
      contextSummary,
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('EXTENSION_ASK_ERROR', sanitizeErrorMessage(error, 'extension/ask'), {}, 500, requestId);
  }
}

export async function handleExtensionLearn(request: Request, requestId: string, env: any) {
  try {
    const { safeParseJson } = await import('../utils/response.js');
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    if (!body?.url || !body?.source) {
      return createErrorResponse('VALIDATION_ERROR', 'url and source are required', {}, 400, requestId);
    }

    const {
      initSanityClient,
      getDocument,
      upsertDocument,
    } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 500, requestId);
    }

    const intel = await buildRabbitIntel(body, env, client);
    const host = intel.page?.domain || 'unknown';
    const sessionId = String(body.learnMode?.sessionId || `learn-${host}-${Date.now()}`);
    const learnSessionDocId = `learnSession-${toSafeId(sessionId)}`;
    const existing = await getDocument(client, learnSessionDocId).catch(() => null) as Record<string, any> | null;

    const pathTemplate = buildLearnPathTemplate(body.url);
    const mappedFields = inferMappedFields(body);
    const entityHints = inferEntityHints(body, intel);
    const validationFindings = buildValidationFindings(body, intel);
    const assumptions = buildLearnAssumptions(body, intel, mappedFields);
    const consensusModel = buildConsensusModel(body, intel, mappedFields);
    const observation = {
      pathTemplate,
      source: body.source,
      title: body.title || host,
      mappedFields,
      entityHints,
      seenCount: 1,
      lastSeenAt: body.capturedAt || new Date().toISOString(),
    };

    const mergedSession = mergeLearnSession(existing, {
      _id: learnSessionDocId,
      _type: 'learnSession',
      sessionId,
      status: 'active',
      label: body.learnMode?.label || `Learn ${host}`,
      source: body.source,
      host,
      accountKey: intel.primaryAccount?.accountKey || '',
      accountDomain: intel.primaryAccount?.domain || host,
      observationCount: (existing?.observationCount || 0) + 1,
      pagePatterns: [observation],
      consensusModel,
      assumptions,
      validationFindings,
      startedAt: existing?.startedAt || body.learnMode?.startedAt || new Date().toISOString(),
      lastObservedAt: body.capturedAt || new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await upsertDocument(client, mergedSession);

    const crawlSnapshotId = buildDeterministicSnapshotId({
      namespace: 'crawl.snapshot.learn',
      accountKey: intel.primaryAccount?.accountKey || null,
      accountId: intel.primaryAccount?._id || null,
      urlOrPath: `${host}-${pathTemplate}`,
    });
    await upsertDocument(client, {
      _id: crawlSnapshotId,
      _type: 'crawl.snapshot',
      accountRef: intel.primaryAccount?._id ? { _type: 'reference', _ref: intel.primaryAccount._id } : null,
      accountKey: intel.primaryAccount?.accountKey || '',
      snapshotClass: 'learn_mode',
      sourceType: body.source,
      url: body.url,
      status: 200,
      snippet: truncateLongText(body.rawText || body.title || body.url, 1000),
      fetchedAt: body.capturedAt || new Date().toISOString(),
      robotsAllowed: true,
      traceId: requestId,
    }).catch(() => {});

    if (validationFindings.length > 0) {
      await upsertDocument(client, {
        _id: `dqFinding-${toSafeId(`${sessionId}-${body.fingerprint || body.url}`)}`,
        _type: 'dq.finding',
        ruleId: 'extension.learn.consensus-check',
        entityType: 'learnSession',
        entityId: learnSessionDocId,
        severity: validationFindings.length > 1 ? 'medium' : 'low',
        summary: validationFindings.join(' | '),
        details: {
          value: JSON.stringify({
            url: body.url,
            source: body.source,
            mappedFields,
            assumptions,
          }),
        },
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }

    await upsertDocument(client, {
      _id: `learning-${toSafeId(`learn-${sessionId}`)}`,
      _type: 'learning',
      learningId: `learn-${sessionId}`,
      title: `Learn Mode consensus for ${host}`,
      summary: buildLearnSummary(intel, mergedSession),
      patternType: 'learn_mode_consensus',
      contextTags: [body.source, host, 'learn-mode'],
      recommendedActions: buildLearnRecommendedActions(mergedSession),
      confidence: Math.min(0.95, 0.45 + ((mergedSession.observationCount || 1) * 0.08)),
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastReferencedAt: new Date().toISOString(),
      referenceCount: mergedSession.observationCount || 1,
    }).catch(() => {});

    await upsertDocument(client, {
      _id: `moltPattern-${toSafeId(`learn-${host}`)}`,
      _type: 'molt.pattern',
      patternType: 'learn_mode_page_pattern',
      summary: `Learn Mode has observed ${(mergedSession.pagePatterns || []).length} recurring page pattern(s) for ${host}.`,
      conditions: {
        value: JSON.stringify({
          host,
          source: body.source,
          pagePatterns: (mergedSession.pagePatterns || []).map((item: any) => ({
            pathTemplate: item.pathTemplate,
            mappedFields: item.mappedFields,
            entityHints: item.entityHints,
          })),
        }),
      },
      recommendedMoves: buildLearnRecommendedActions(mergedSession),
      successStats: {
        value: JSON.stringify({
          observationCount: mergedSession.observationCount || 1,
          validationFindingCount: (mergedSession.validationFindings || []).length,
        }),
      },
      lastUpdated: new Date().toISOString(),
    }).catch(() => {});

    return createSuccessResponse({
      sessionId,
      host,
      summary: buildLearnSummary(intel, mergedSession),
      mappedFields: uniqueStrings((mergedSession.consensusModel?.fieldCoverage || []).slice(0, 12)),
      validationFindings: (mergedSession.validationFindings || []).slice(0, 6),
      pagePatterns: (mergedSession.pagePatterns || []).slice(0, 8).map((item: any) => item.pathTemplate),
      observationCount: mergedSession.observationCount || 1,
      consensusModel: mergedSession.consensusModel || {},
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('EXTENSION_LEARN_ERROR', sanitizeErrorMessage(error, 'extension/learn'), {}, 500, requestId);
  }
}

// ─── Extension Feedback (Phase C: Human-in-the-Loop) ─────────────────────

/**
 * POST /extension/feedback
 *
 * Receives user feedback on AI responses shown in the extension overlay.
 * Stores as a molt.event (Index+Blob) via emitActivityEvent() and optionally
 * patches the original interaction document with the feedback signal.
 *
 * Body: { promptId: string, feedback: string, rating?: 'positive'|'negative', context?: object }
 *
 * Auth: MOLT_API_KEY (global middleware)
 */

const VALID_RATINGS = ['positive', 'negative'] as const;
type FeedbackRating = typeof VALID_RATINGS[number];

export async function handleExtensionFeedback(request: Request, requestId: string, env: any) {
  try {
    // ── Size gate ────────────────────────────────────────────────────
    const { isBodyWithinSizeLimit, stripHtmlTags } = await import('../utils/extension-sanitize.js');
    if (!isBodyWithinSizeLimit(request)) {
      return createErrorResponse('PAYLOAD_TOO_LARGE', 'Request body exceeds 50KB limit', {}, 413, requestId);
    }

    const body: Record<string, unknown> = await request.json().catch(() => ({}));

    // ── Validate required fields ────────────────────────────────────
    const promptId = typeof body.promptId === 'string' ? body.promptId.trim() : '';
    const feedback = typeof body.feedback === 'string' ? stripHtmlTags(body.feedback).trim() : '';

    // ── Validate optional fields ────────────────────────────────────
    const ratingRaw = typeof body.rating === 'string' ? body.rating.trim().toLowerCase() : null;
    const rating: FeedbackRating | null = ratingRaw && (VALID_RATINGS as readonly string[]).includes(ratingRaw)
      ? ratingRaw as FeedbackRating
      : null;

    if (!promptId) {
      return createErrorResponse('VALIDATION_ERROR', 'promptId is required', {}, 400, requestId);
    }
    if (!feedback && !rating) {
      return createErrorResponse('VALIDATION_ERROR', 'feedback or rating is required', {}, 400, requestId);
    }

    // SECURITY: context flows into eventData blob in Sanity. Currently the extension
    // sends { prompt, answerPreview, url, domain } — all bounded, non-sensitive.
    // If future extension code adds fields to context, they'll be stored. Only add
    // bounded, non-sensitive fields at the extension construction site (content.js).
    const context = (body.context && typeof body.context === 'object' && !Array.isArray(body.context))
      ? body.context as Record<string, unknown>
      : null;

    // Extract accountKey from context if provided (for activity event indexing)
    const accountKey = typeof context?.accountKey === 'string' ? context.accountKey : null;
    const domain = typeof context?.domain === 'string' ? context.domain : null;

    // ── Truncate feedback to prevent abuse ───────────────────────────
    const safeFeedback = feedback.slice(0, 2000);

    // ── Store as activity event (Index+Blob) ────────────────────────
    const { emitActivityEvent } = await import('../lib/sanity.ts');
    const eventId = await emitActivityEvent(env, {
      eventType: 'prompt',
      status: 'completed',
      source: 'extension',
      accountKey,
      category: 'interaction',
      message: `Feedback on prompt: ${rating || 'comment'}`,
      data: {
        promptId,
        feedback: safeFeedback,
        rating,
        domain,
        ...(context ? { context } : {}),
      },
      idempotencyKey: `ext.feedback.${promptId}.${requestId}`,
    });

    // ── Patch original interaction if promptId maps to one ──────────
    // Fire-and-forget: don't block the response on patch success.
    const { initSanityClient, patchDocument, getDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (client) {
      // promptId may be a requestId from /extension/ask — interactions are stored
      // with _id pattern `interaction.{sessionId}-{timestamp}`. Try direct lookup
      // if promptId looks like an interaction ID, otherwise skip.
      const interactionLookup = promptId.startsWith('interaction.')
        ? promptId
        : null;

      if (interactionLookup) {
        getDocument(client, interactionLookup).then(async (doc: any) => {
          if (doc?._id) {
            await patchDocument(client, doc._id, {
              set: {
                feedback: rating || (safeFeedback ? 'comment' : null),
                feedbackText: safeFeedback || undefined,
                updatedAt: new Date().toISOString(),
              },
            });
          }
        }).catch((err: any) => {
          console.error('[extension/feedback] Interaction patch failed (non-blocking):', err?.message);
        });
      }
    }

    return createSuccessResponse({
      stored: true,
      eventId,
      promptId,
      rating,
    }, requestId);
  } catch (error: any) {
    return createErrorResponse(
      'EXTENSION_FEEDBACK_ERROR',
      sanitizeErrorMessage(error, 'extension/feedback'),
      {},
      500,
      requestId,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// SECURITY: All GROQ queries in buildRabbitIntel use parameterized $params, not string
// interpolation. Verified safe against injection — see secops Phase 1 Finding 4.
export async function buildRabbitIntel(body: CapturePayload, env: any, client: any) {
  const { groqQuery, extractDomain, generateAccountKey, normalizeCanonicalUrl } = await import('../sanity-client.js');
  const pageDomain = extractDomain(body.contextUrl || body.url || '');
  const contactSignals = extractContactSignals(body);
  const pageAccountHints = [
    ...(body.accounts || []).map((account) => account.name).filter(Boolean),
    pageDomain,
  ].filter(Boolean) as string[];

  const primaryAccount = await resolvePrimaryAccount({
    body,
    client,
    groqQuery,
    pageDomain,
    generateAccountKey,
    normalizeCanonicalUrl,
  });

  const matchedPeople = await resolveMatchedPeople(groqQuery, client, body, primaryAccount);
  const matchedConnections = await resolveMatchedConnections(groqQuery, client, body, primaryAccount);
  const recentConversation = primaryAccount
    ? await groqQuery(client, `*[_type == "interaction" && (accountKey == $accountKey || domain == $domain)] | order(timestamp desc)[0...5]{
      _id, userPrompt, gptResponse, timestamp, followUpNeeded, contextTags
    }`, { accountKey: primaryAccount.accountKey, domain: primaryAccount.domain }) || []
    : [];
  const recentLearnings = primaryAccount
    ? await groqQuery(client, `*[_type == "learning" && references($accountId)] | order(createdAt desc)[0...5]{
      _id, title, summary, relevanceScore, patternType, recommendedActions
    }`, { accountId: primaryAccount._id }) || []
    : [];

  const opportunities = buildOpportunityCards({
    body,
    pageDomain,
    primaryAccount,
    matchedPeople,
    matchedConnections,
    contactSignals,
    recentConversation,
  });
  const dedupedOpportunities = dedupeOpportunityCards(opportunities);
  const interruptLevel = computeInterruptLevel(dedupedOpportunities, contactSignals, matchedConnections);
  const interruptKey = [
    body.source,
    primaryAccount?.accountKey || primaryAccount?.domain || body.url,
    dedupedOpportunities.map((item) => item.type).join(','),
    contactSignals.map((item) => item.value).join(','),
  ].join('|');

  const nextActions = buildNextActions({
    body,
    primaryAccount,
    opportunities: dedupedOpportunities,
    matchedPeople,
    matchedConnections,
    contactSignals,
  });

  return {
    groqQuery,
    page: {
      url: body.url,
      source: body.source,
      title: body.title,
      domain: pageDomain,
      headings: (body.headings || []).slice(0, 8),
    },
    summary: buildPageSummary(body, primaryAccount, dedupedOpportunities, matchedConnections),
    primaryAccount,
    matchedPeople,
    connections: matchedConnections,
    contacts: contactSignals,
    opportunities: dedupedOpportunities,
    nextActions,
    recentConversation,
    recentLearnings,
    interruptLevel,
    interruptKey,
    shouldStoreCapture: shouldStoreCapture(body, primaryAccount, dedupedOpportunities, contactSignals, pageAccountHints),
    shouldQueueResearch: !!primaryAccount && ((primaryAccount.profileCompleteness?.score ?? 0) < 70 || dedupedOpportunities.length > 0),
  };
}

async function resolvePrimaryAccount(opts: {
  body: CapturePayload;
  client: any;
  groqQuery: Function;
  pageDomain: string | null;
  generateAccountKey: Function;
  normalizeCanonicalUrl: Function;
}) {
  const { body, client, groqQuery, pageDomain, generateAccountKey, normalizeCanonicalUrl } = opts;
  const hintedDomain = (body.accounts || []).map((account) => account.domain).find(Boolean) || pageDomain;
  if (hintedDomain) {
    const byDomain = await groqQuery(client, `*[_type == "account" && (domain == $domain || rootDomain == $domain)][0]{
      _id, accountKey, domain, rootDomain, canonicalUrl, companyName, name, industry,
      opportunityScore, profileCompleteness, signals, leadership, painPoints, benchmarks,
      technologyStack, lastScannedAt, lastEnrichedAt
    }`, { domain: hintedDomain });
    if (byDomain) return byDomain;

    const canonicalUrl = normalizeCanonicalUrl(`https://${hintedDomain}`);
    const accountKey = await generateAccountKey(canonicalUrl);
    if (accountKey) {
      const byKey = await groqQuery(client, `*[_type == "account" && accountKey == $accountKey][0]{
        _id, accountKey, domain, rootDomain, canonicalUrl, companyName, name, industry,
        opportunityScore, profileCompleteness, signals, leadership, painPoints, benchmarks,
        technologyStack, lastScannedAt, lastEnrichedAt
      }`, { accountKey });
      if (byKey) return byKey;
    }
  }

  for (const hint of (body.accounts || []).map((account) => account.name).filter(Boolean).slice(0, 3)) {
    const match = await groqQuery(client, `*[_type == "account" && (companyName match $q || name match $q)][0]{
      _id, accountKey, domain, rootDomain, canonicalUrl, companyName, name, industry,
      opportunityScore, profileCompleteness, signals, leadership, painPoints, benchmarks,
      technologyStack, lastScannedAt, lastEnrichedAt
    }`, { q: `${hint}*` });
    if (match) return match;
  }

  return null;
}

async function resolveMatchedPeople(groqQuery: Function, client: any, body: CapturePayload, primaryAccount: any) {
  const matches: any[] = [];
  const seen = new Set<string>();
  const names = (body.people || []).map((person) => person.name).filter(Boolean).slice(0, 5);
  const emails = (body.emails || []).concat((body.people || []).map((person) => person.email).filter(Boolean)).slice(0, 10);

  for (const email of emails) {
    const person = await groqQuery(client, `*[_type == "person" && email == $email][0]{
      _id, name, email, headline, currentCompany, currentTitle, relatedAccountKey, seniorityLevel, roleCategory
    }`, { email });
    if (person && !seen.has(person._id)) {
      seen.add(person._id);
      matches.push(person);
    }
  }

  for (const name of names) {
    const person = await groqQuery(client, `*[_type == "person" && name match $name][0]{
      _id, name, email, headline, currentCompany, currentTitle, relatedAccountKey, seniorityLevel, roleCategory
    }`, { name: `${name}*` });
    if (person && !seen.has(person._id)) {
      seen.add(person._id);
      matches.push(person);
    }
  }

  if (primaryAccount?.accountKey) {
    const related = await groqQuery(client, `*[_type == "person" && relatedAccountKey == $accountKey][0...5]{
      _id, name, email, headline, currentCompany, currentTitle, relatedAccountKey, seniorityLevel, roleCategory
    }`, { accountKey: primaryAccount.accountKey }) || [];
    for (const person of related) {
      if (!seen.has(person._id)) {
        seen.add(person._id);
        matches.push(person);
      }
    }
  }

  return matches.slice(0, 8);
}

async function resolveMatchedConnections(groqQuery: Function, client: any, body: CapturePayload, primaryAccount: any) {
  const matches: any[] = [];
  const seen = new Set<string>();
  const names = (body.people || []).map((person) => person.name).filter(Boolean).slice(0, 5);

  for (const name of names) {
    const connection = await groqQuery(client, `*[_type == "networkPerson" && name match $name][0]{
      _id, name, company, title, tier, relationshipStrength, lastTouchedAt, linkedinUrl
    }`, { name: `${name}*` });
    if (connection && !seen.has(connection._id)) {
      seen.add(connection._id);
      matches.push(connection);
    }
  }

  if (primaryAccount?.companyName || primaryAccount?.name) {
    const company = primaryAccount.companyName || primaryAccount.name;
    const companyMatches = await groqQuery(client, `*[_type == "networkPerson" && company match $company][0...5]{
      _id, name, company, title, tier, relationshipStrength, lastTouchedAt, linkedinUrl
    }`, { company: `${company}*` }) || [];
    for (const connection of companyMatches) {
      if (!seen.has(connection._id)) {
        seen.add(connection._id);
        matches.push(connection);
      }
    }
  }

  return matches.slice(0, 6);
}

function buildPageSummary(body: CapturePayload, primaryAccount: any, opportunities: any[], matchedConnections: any[]) {
  const source = sourceLabel(body.source);
  const accountName = primaryAccount?.companyName || primaryAccount?.name || primaryAccount?.domain || null;
  if (opportunities.length > 0) {
    return `${source} page${accountName ? ` for ${accountName}` : ''}. I found ${opportunities.length} actionable signal${opportunities.length === 1 ? '' : 's'}${matchedConnections.length ? ` and ${matchedConnections.length} known connection${matchedConnections.length === 1 ? '' : 's'}` : ''}.`;
  }
  if (accountName) {
    return `${source} page for ${accountName}. Rabbit is tracking the account and watching for the next high-value opening.`;
  }
  return `${source} page observed. Rabbit is extracting entities, contacts, and signals from what is visible right now.`;
}

function buildOpportunityCards(input: {
  body: CapturePayload;
  pageDomain: string | null;
  primaryAccount: any;
  matchedPeople: any[];
  matchedConnections: any[];
  contactSignals: any[];
  recentConversation: any[];
}) {
  const { body, primaryAccount, matchedPeople, matchedConnections, contactSignals, recentConversation } = input;
  const cards: any[] = [];

  if (matchedConnections.length > 0) {
    cards.push({
      type: 'warm-path',
      title: `${matchedConnections.length} warm connection${matchedConnections.length === 1 ? '' : 's'} matched on this page`,
      confidence: 'high',
    });
  }

  if (contactSignals.length > 0) {
    cards.push({
      type: 'contact-signal',
      title: `${contactSignals.length} direct contact detail${contactSignals.length === 1 ? '' : 's'} visible and usable here`,
      confidence: 'high',
    });
  }

  if (matchedPeople.some((person) => person.seniorityLevel === 'c-suite' || person.seniorityLevel === 'vp')) {
    cards.push({
      type: 'decision-maker',
      title: 'A likely decision-maker is visible on this page',
      confidence: 'medium',
    });
  }

  if (body.source === 'commonroom' && (body.signals || []).length > 0) {
    cards.push({
      type: 'community-activity',
      title: 'Common Room activity suggests a live engagement moment',
      confidence: 'medium',
    });
  }

  if (body.source === 'salesforce' && /renew|upsell|expand|churn|at risk/i.test(body.rawText || '')) {
    cards.push({
      type: 'crm-opportunity',
      title: 'Salesforce page contains renewal, churn, or expansion language',
      confidence: 'high',
    });
  }

  if (primaryAccount && (primaryAccount.profileCompleteness?.score ?? 0) < 50) {
    cards.push({
      type: 'intel-gap',
      title: `This account is only ${primaryAccount.profileCompleteness?.score ?? 0}% enriched, so every live touchpoint here is valuable`,
      confidence: 'medium',
    });
  }

  if (recentConversation.some((item) => item.followUpNeeded)) {
    cards.push({
      type: 'follow-up',
      title: 'There is already an unresolved follow-up chain tied to this account',
      confidence: 'medium',
    });
  }

  return cards.slice(0, 6);
}

function dedupeOpportunityCards(cards: any[]) {
  const seen = new Set<string>();
  const out = [];
  for (const card of cards) {
    const key = `${card.type}:${card.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

function computeInterruptLevel(opportunities: any[], contactSignals: any[], matchedConnections: any[]) {
  if (contactSignals.length > 0 || matchedConnections.length > 0) return 'high';
  if (opportunities.some((item) => ['crm-opportunity', 'decision-maker', 'warm-path'].includes(item.type))) return 'high';
  if (opportunities.length >= 2) return 'medium';
  if (opportunities.length === 1) return 'low';
  return 'quiet';
}

function buildNextActions(input: {
  body: CapturePayload;
  primaryAccount: any;
  opportunities: any[];
  matchedPeople: any[];
  matchedConnections: any[];
  contactSignals: any[];
}) {
  const { body, primaryAccount, matchedPeople, matchedConnections, contactSignals } = input;
  const actions = [];

  if (matchedConnections.length > 0) {
    actions.push(`Lead with the warmest visible connection: ${matchedConnections[0].name}${matchedConnections[0].title ? ` (${matchedConnections[0].title})` : ''}.`);
  }
  if (contactSignals.length > 0) {
    actions.push(`Use the visible contact info now: ${contactSignals[0].label || contactSignals[0].value}.`);
  }
  if (matchedPeople.length > 0) {
    actions.push(`Anchor follow-up around ${matchedPeople[0].name}${matchedPeople[0].currentTitle ? `, ${matchedPeople[0].currentTitle}` : ''}.`);
  }
  if (primaryAccount && (primaryAccount.profileCompleteness?.score ?? 0) < 70) {
    actions.push('Let Rabbit keep enriching this account in the background while you work the live opportunity.');
  }
  if (body.source === 'outreach') {
    actions.push('Use this Outreach view to align messaging with the person and account context Rabbit surfaced.');
  }
  if (body.source === 'salesforce') {
    actions.push('Cross-check the CRM state against the visible renewal/expansion language before the next touch.');
  }

  return actions.slice(0, 5);
}

function shouldStoreCapture(body: CapturePayload, primaryAccount: any, opportunities: any[], contactSignals: any[], pageAccountHints: string[]) {
  if (['salesforce', 'commonroom', 'outreach', 'hubspot', 'linkedin'].includes(body.source)) return true;
  if (opportunities.length > 0) return true;
  if (contactSignals.length > 0) return true;
  if (primaryAccount) return true;
  return pageAccountHints.length > 0;
}

function extractContactSignals(body: CapturePayload) {
  const contacts = [];
  const seen = new Set<string>();
  for (const email of (body.emails || []).concat((body.people || []).map((person) => person.email).filter(Boolean))) {
    const value = String(email).trim();
    if (!value || seen.has(`email:${value}`)) continue;
    seen.add(`email:${value}`);
    contacts.push({ type: 'email', value, label: value });
  }
  for (const phone of body.phones || []) {
    const value = String(phone).trim();
    if (!value || seen.has(`phone:${value}`)) continue;
    seen.add(`phone:${value}`);
    contacts.push({ type: 'phone', value, label: value });
  }
  return contacts.slice(0, 12);
}

export function buildRabbitAnswer(prompt: string, intel: any, contextSummary: string) {
  // SECURITY: stripHtmlTags applied to final output — all interpolated values
  // (page title, account name, opportunity titles, contact labels) may contain
  // untrusted data from page scraping or Sanity. Plain text answer should never
  // contain HTML tags. Import is async so we use a local strip here.
  const strip = (v: string) => String(v || '').replace(/<[^>]*>/g, '');

  const lines = [
    `Question: ${strip(prompt)}`,
    '',
    `Current page: ${strip(intel?.page?.title) || 'Unknown page'}${intel?.page?.source ? ` (${sourceLabel(intel.page.source)})` : ''}`,
  ];

  if (intel?.primaryAccount) {
    const accountName = strip(intel.primaryAccount.companyName || intel.primaryAccount.name || intel.primaryAccount.domain);
    lines.push(`Known account: ${accountName}`);
    if (intel.primaryAccount.profileCompleteness?.score != null) {
      lines.push(`Account completeness: ${intel.primaryAccount.profileCompleteness.score}%`);
    }
  }

  if ((intel?.opportunities || []).length > 0) {
    lines.push('', 'What Rabbit sees right now:');
    for (const item of intel.opportunities.slice(0, 4)) {
      lines.push(`- ${strip(item.title || item)}`);
    }
  }

  if ((intel?.contacts || []).length > 0) {
    lines.push('', `Contact details surfaced: ${(intel.contacts || []).slice(0, 4).map((item: any) => strip(item.label || item.value)).join(', ')}`);
  }

  if ((intel?.connections || []).length > 0) {
    lines.push(`Warm paths: ${(intel.connections || []).slice(0, 3).map((item: any) => `${strip(item.name)}${item.title ? ` (${strip(item.title)})` : ''}`).join(', ')}`);
  }

  lines.push('', 'Stored system context:');
  lines.push(truncateLongText(contextSummary || 'No stored context found.', 1200));

  if ((intel?.nextActions || []).length > 0) {
    lines.push('', 'Best next moves:');
    for (const step of intel.nextActions.slice(0, 5)) {
      lines.push(`- ${strip(step)}`);
    }
  }

  return lines.join('\n');
}

function sourceLabel(source: string) {
  switch (source) {
    case 'salesforce': return 'Salesforce';
    case 'commonroom': return 'Common Room';
    case 'outreach': return 'Outreach';
    case 'hubspot': return 'HubSpot';
    case 'linkedin': return 'LinkedIn';
    default: return 'Web';
  }
}

function truncateLongText(value: string, maxLen: number) {
  const text = String(value || '');
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

function normalizeCapturedDomain(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function inferCapturedCompanyName(body: CapturePayload, domain: string): string {
  const topLevel = String(body.interaction?.companyName || body.companyName || '').trim();
  if (topLevel) return topLevel;

  const accountName = (body.accounts || []).find((item) => item?.name)?.name;
  if (accountName) return String(accountName).trim();

  const personCompany = (body.people || []).find((item) => item?.currentCompany)?.currentCompany;
  if (personCompany) return String(personCompany).trim();

  const metaSiteName = String(
    body.metadata?.ogSiteName
      || body.metadata?.['og:site_name']
      || body.metadata?.['application-name']
      || '',
  ).trim();
  if (metaSiteName) return metaSiteName;

  const titleRoot = String(body.interaction?.title || body.title || '')
    .split(/\s+[\|\-–—]\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  if (titleRoot) return titleRoot;

  const domainRoot = normalizeCapturedDomain(domain).split('.')[0] || '';
  return domainRoot ? domainRoot.charAt(0).toUpperCase() + domainRoot.slice(1) : '';
}

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
  // P0-5: Preserve existing technologyStack when incoming doesn't have one
  if (!out.technologyStack && existing.technologyStack && typeof existing.technologyStack === 'object') {
    out.technologyStack = existing.technologyStack;
  }
  return out;
}

function mergePersonForExtension(existing: Record<string, any> | null, incoming: Record<string, any>): Record<string, any> {
  const out = { ...incoming };
  if (!existing) return out;
  for (const k of ['name', 'title', 'headline', 'currentCompany', 'currentTitle', 'linkedinUrl', 'email', 'phone', 'location', 'about']) {
    if (out[k] != null && out[k] !== '') continue;
    if (existing[k] != null && existing[k] !== '') out[k] = existing[k];
  }
  if (Array.isArray(existing.skills) && existing.skills.length) {
    const combined = [...new Set([...(out.skills || []), ...existing.skills])];
    out.skills = combined;
  }
  if (Array.isArray(existing.sourceSystems) && existing.sourceSystems.length) {
    const combined = [...new Set([...(out.sourceSystems || []), ...existing.sourceSystems])];
    out.sourceSystems = combined;
  }
  // Preserve contact arrays — incoming wins if present (already has new sighting appended),
  // otherwise keep existing. Do NOT dedup here — consensus engine handles scoring/dedup.
  if (!out.contactEmails?.length && existing.contactEmails?.length) out.contactEmails = existing.contactEmails;
  if (!out.contactPhones?.length && existing.contactPhones?.length) out.contactPhones = existing.contactPhones;
  if (!out.companyRef && existing.companyRef) out.companyRef = existing.companyRef;
  if (!out.relatedAccountKey && existing.relatedAccountKey) out.relatedAccountKey = existing.relatedAccountKey;
  if (!out.rootDomain && existing.rootDomain) out.rootDomain = existing.rootDomain;
  if (Array.isArray(existing.experience) && existing.experience.length && !(out.experience?.length)) out.experience = existing.experience;
  if (Array.isArray(existing.education) && existing.education.length && !(out.education?.length)) out.education = existing.education;
  return out;
}

function buildLearnPathTemplate(inputUrl: string): string {
  try {
    const url = new URL(inputUrl);
    const normalized = url.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => (/^\d+$/.test(part) || /^[0-9a-f-]{8,}$/i.test(part) ? ':id' : part))
      .join('/');
    return `/${normalized}`.replace(/\/+/g, '/');
  } catch {
    return '/';
  }
}

function inferMappedFields(body: CapturePayload): string[] {
  const fields: string[] = [];
  if ((body.accounts || []).some((item) => item.name)) fields.push('account.name');
  if ((body.accounts || []).some((item) => item.domain || item.url || item.website)) fields.push('account.domain');
  if ((body.accounts || []).some((item) => item.industry)) fields.push('account.industry');
  if ((body.people || []).some((item) => item.name)) fields.push('person.name');
  if ((body.people || []).some((item) => item.title || item.currentTitle || item.headline)) fields.push('person.title');
  if ((body.people || []).some((item) => item.currentCompany)) fields.push('person.company');
  if ((body.emails || []).length || (body.people || []).some((item) => item.email)) fields.push('contact.email');
  if ((body.phones || []).length) fields.push('contact.phone');
  if ((body.technologies || []).length) fields.push('technology.detected');
  if ((body.signals || []).length) fields.push('signal.inline');
  if ((body.headings || []).length) fields.push('page.headings');
  if ((body.links || []).length) fields.push('page.links');
  if (body.metadata?.canonical || body.metadata?.description || body.metadata?.ogTitle) fields.push('page.metadata');
  return uniqueStrings(fields);
}

function inferEntityHints(body: CapturePayload, intel: any): string[] {
  return uniqueStrings([
    ...(body.accounts || []).map((item) => item.name || item.domain || '').filter(Boolean),
    ...(body.people || []).map((item) => item.name || item.email || '').filter(Boolean),
    ...(body.technologies || []).map((item: any) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean),
    intel?.primaryAccount?.companyName || intel?.primaryAccount?.name || intel?.primaryAccount?.domain || '',
  ]).slice(0, 12);
}

function buildValidationFindings(body: CapturePayload, intel: any): string[] {
  const findings: string[] = [];
  const accountNames = uniqueStrings((body.accounts || []).map((item) => item.name || '').filter(Boolean));
  const accountDomains = uniqueStrings((body.accounts || []).map((item) => item.domain || '').filter(Boolean));
  if (accountNames.length > 1) findings.push(`Multiple account names observed: ${accountNames.slice(0, 3).join(', ')}`);
  if (accountDomains.length > 1) findings.push(`Multiple account domains observed: ${accountDomains.slice(0, 3).join(', ')}`);
  if (body.source === 'salesforce' && !body.people?.length) findings.push('CRM page did not surface a clear contact/person record.');
  if ((body.people || []).length > 0 && !intel?.matchedPeople?.length) findings.push('Visible people are not yet strongly linked to stored person records.');
  if ((body.technologies || []).length > 0 && !intel?.primaryAccount) findings.push('Technology signals are visible before a primary account was confidently resolved.');
  if ((intel?.primaryAccount?.profileCompleteness?.score ?? 100) < 50) findings.push('Matched account remains low-completeness and needs more validation.');
  return uniqueStrings(findings).slice(0, 8);
}

function buildLearnAssumptions(body: CapturePayload, intel: any, mappedFields: string[]): string[] {
  const assumptions: string[] = [];
  if (mappedFields.includes('account.name')) assumptions.push('This page family consistently exposes account identity.');
  if (mappedFields.includes('person.name') && mappedFields.includes('person.title')) assumptions.push('Visible person cards are likely role-bearing stakeholders.');
  if (mappedFields.includes('technology.detected')) assumptions.push('Repeated pasted or visible technologies should merge into the account consensus model.');
  if ((body.emails || []).length || (body.phones || []).length) assumptions.push('Direct contact signals on this page are usable validation sources.');
  if (intel?.primaryAccount?.accountKey) assumptions.push(`Current walkthrough appears centered on account ${intel.primaryAccount.accountKey}.`);
  return uniqueStrings(assumptions).slice(0, 8);
}

function buildConsensusModel(body: CapturePayload, intel: any, mappedFields: string[]) {
  return {
    companyNames: uniqueStrings([
      ...(body.accounts || []).map((item) => item.name || '').filter(Boolean),
      intel?.primaryAccount?.companyName || '',
      intel?.primaryAccount?.name || '',
    ]),
    people: uniqueStrings([
      ...(body.people || []).map((item) => item.name || item.email || '').filter(Boolean),
      ...(intel?.matchedPeople || []).map((item: any) => item.name || item.email || '').filter(Boolean),
    ]),
    technologies: uniqueStrings(
      (body.technologies || []).map((item: any) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean),
    ),
    contacts: uniqueStrings([
      ...(body.emails || []),
      ...(body.phones || []),
      ...((intel?.contacts || []).map((item: any) => item.label || item.value || '').filter(Boolean)),
    ]),
    signals: uniqueStrings([
      ...((body.signals || []).map((item: any) => typeof item === 'string' ? item : item?.text || item?.label || '').filter(Boolean)),
      ...((intel?.opportunities || []).map((item: any) => item.title || item.type || '').filter(Boolean)),
    ]),
    fieldCoverage: uniqueStrings(mappedFields),
  };
}

function mergeLearnSession(existing: Record<string, any> | null, incoming: Record<string, any>): Record<string, any> {
  if (!existing) {
    return {
      ...incoming,
      pagePatterns: incoming.pagePatterns || [],
      assumptions: uniqueStrings(incoming.assumptions || []),
      validationFindings: uniqueStrings(incoming.validationFindings || []),
      consensusModel: incoming.consensusModel || {},
    };
  }

  const patternsByPath = new Map<string, any>();
  for (const item of existing.pagePatterns || []) {
    if (item?.pathTemplate) patternsByPath.set(item.pathTemplate, { ...item });
  }
  for (const item of incoming.pagePatterns || []) {
    if (!item?.pathTemplate) continue;
    const prev = patternsByPath.get(item.pathTemplate);
    patternsByPath.set(item.pathTemplate, prev ? {
      ...prev,
      source: item.source || prev.source,
      title: bestString(prev.title, item.title),
      mappedFields: uniqueStrings([...(prev.mappedFields || []), ...(item.mappedFields || [])]),
      entityHints: uniqueStrings([...(prev.entityHints || []), ...(item.entityHints || [])]),
      seenCount: (prev.seenCount || 1) + 1,
      lastSeenAt: item.lastSeenAt || prev.lastSeenAt,
    } : item);
  }

  return {
    ...existing,
    ...incoming,
    pagePatterns: Array.from(patternsByPath.values()).slice(-20),
    assumptions: uniqueStrings([...(existing.assumptions || []), ...(incoming.assumptions || [])]).slice(0, 20),
    validationFindings: uniqueStrings([...(existing.validationFindings || []), ...(incoming.validationFindings || [])]).slice(0, 20),
    consensusModel: {
      companyNames: uniqueStrings([...(existing.consensusModel?.companyNames || []), ...(incoming.consensusModel?.companyNames || [])]),
      people: uniqueStrings([...(existing.consensusModel?.people || []), ...(incoming.consensusModel?.people || [])]),
      technologies: uniqueStrings([...(existing.consensusModel?.technologies || []), ...(incoming.consensusModel?.technologies || [])]),
      contacts: uniqueStrings([...(existing.consensusModel?.contacts || []), ...(incoming.consensusModel?.contacts || [])]),
      signals: uniqueStrings([...(existing.consensusModel?.signals || []), ...(incoming.consensusModel?.signals || [])]),
      fieldCoverage: uniqueStrings([...(existing.consensusModel?.fieldCoverage || []), ...(incoming.consensusModel?.fieldCoverage || [])]),
    },
  };
}

function buildLearnSummary(intel: any, session: any): string {
  const host = session?.host || intel?.page?.domain || 'this app';
  const pages = (session?.pagePatterns || []).length;
  const fields = (session?.consensusModel?.fieldCoverage || []).length;
  const checks = (session?.validationFindings || []).length;
  return `Learn Mode has mapped ${pages} page pattern${pages === 1 ? '' : 's'} on ${host}, inferred ${fields} reusable field signal${fields === 1 ? '' : 's'}, and surfaced ${checks} validation checkpoint${checks === 1 ? '' : 's'}.`;
}

function buildLearnRecommendedActions(session: any): string[] {
  const actions: string[] = [];
  if ((session?.validationFindings || []).length > 0) actions.push('Review duplicate and validation findings before trusting the consensus model fully.');
  if ((session?.consensusModel?.technologies || []).length > 0) actions.push('Merge repeated technology evidence into the account technology stack.');
  if ((session?.consensusModel?.people || []).length > 0) actions.push('Link repeated people signals to known stakeholders and buying roles.');
  actions.push('Keep browsing the same app flow so Learn Mode can strengthen its schema assumptions.');
  return uniqueStrings(actions).slice(0, 5);
}

function uniqueStrings(values: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function toSafeId(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
