/**
 * Background Enrichment Service
 * 
 * Manages background research pipelines for accounts:
 * - Queues enrichment jobs
 * - Executes pipelines over time
 * - Stores complete research sets
 * - Allows recall of enriched data
 */

import {
  createPipelineJob,
  executeNextPipelineStage,
  getPipelineProgress,
  buildCompleteResearchSet,
  PIPELINE_STAGES,
} from './research-pipeline.js';

const ENRICHMENT_JOB_TYPES = '["enrich.job", "enrichmentJob"]';
const VIRTUAL_ENRICHMENT_STATE_TTL_SECONDS = 60 * 60 * 24;

function getVirtualEnrichmentStore(env) {
  return env?.MOLTBOOK_ACTIVITY_KV || env?.RATE_LIMIT_KV || null;
}

async function readVirtualEnrichmentState(env, accountKey) {
  const store = getVirtualEnrichmentStore(env);
  if (!store || !accountKey) return null;
  try {
    const raw = await store.get(`virtual-enrichment:${accountKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeVirtualEnrichmentState(env, job) {
  const store = getVirtualEnrichmentStore(env);
  if (!store || !job?.accountKey) return;
  await store.put(`virtual-enrichment:${job.accountKey}`, JSON.stringify({
    jobId: job.jobId,
    goalKey: job.goalKey || 'full_pipeline',
    status: job.status,
    currentStage: job.currentStage,
    completedStages: job.completedStages || [],
    failedStages: job.failedStages || [],
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    priority: job.priority || 50,
    requestedStages: job.options?.requestedStages || [],
    includeLinkedIn: job.options?.includeLinkedIn !== false,
    includeBrief: job.options?.includeBrief !== false,
    includeVerification: job.options?.includeVerification !== false,
    maxDepth: job.options?.maxDepth || 2,
    budget: job.options?.budget || 20,
    source: job.metadata?.source || 'background_enrichment',
    createdBy: job.metadata?.createdBy || 'system',
  }), {
    expirationTtl: VIRTUAL_ENRICHMENT_STATE_TTL_SECONDS,
  });
}

async function clearVirtualEnrichmentState(env, accountKey) {
  const store = getVirtualEnrichmentStore(env);
  if (!store || !accountKey) return;
  try {
    await store.delete(`virtual-enrichment:${accountKey}`);
  } catch {
    // Ignore KV cleanup failures.
  }
}

function mapStageToPayloadField(stage) {
  switch (stage) {
    case PIPELINE_STAGES.INITIAL_SCAN:
      return {
        input: result.input || null,
        finalUrl: result.finalUrl || null,
        status: result.status ?? null,
        title: result.title || null,
        note: result.note || null,
        sizeLimitExceeded: result.sizeLimitExceeded === true,
        businessUnits: result.businessUnits
          ? {
              companyName: result.businessUnits.companyName || null,
              description: result.businessUnits.description || null,
              industry: result.businessUnits.industry || null,
            }
          : null,
        technologyStack: result.technologyStack || null,
        aiReadiness: result.aiReadiness || null,
        businessScale: result.businessScale || null,
        contentSignals: Array.isArray(result.contentSignals)
          ? result.contentSignals.slice(0, 10).map((signal) => ({
              type: signal?.type || null,
              label: signal?.label || null,
              value: signal?.value || null,
            }))
          : [],
      };

    case PIPELINE_STAGES.INITIAL_SCAN:
      return 'scan';
    case PIPELINE_STAGES.DISCOVERY:
      return 'discovery';
    case PIPELINE_STAGES.CRAWL:
      return 'crawl';
    case PIPELINE_STAGES.EXTRACTION:
      return 'evidence';
    case PIPELINE_STAGES.LINKEDIN:
      return 'linkedin';
    case PIPELINE_STAGES.BRIEF:
      return 'brief';
    case PIPELINE_STAGES.VERIFICATION:
      return 'verification';
    default:
      return null;
  }
}

function sanitizeStageResult(stage, result) {
  if (!result || typeof result !== 'object') return result;

  switch (stage) {
    case PIPELINE_STAGES.DISCOVERY:
      return {
        canonicalRoot: result.canonicalRoot || null,
        candidates: Array.isArray(result.candidates)
          ? result.candidates.slice(0, 25).map((candidate) => ({
              url: candidate?.url || null,
              type: candidate?.type || null,
              title: candidate?.title || null,
              score: candidate?.score ?? null,
            }))
          : [],
      };

    case PIPELINE_STAGES.CRAWL:
      return {
        root: result.root || null,
        fetched: Array.isArray(result.fetched)
          ? result.fetched.slice(0, 20).map((page) => ({
              url: page?.url || null,
              finalUrl: page?.finalUrl || null,
              status: page?.status ?? null,
              title: page?.title || null,
              fetchedAt: page?.fetchedAt || null,
              excerpts: Array.isArray(page?.excerpts)
                ? page.excerpts.slice(0, 3).map((excerpt) => ({
                    text: excerpt?.text || null,
                    source: excerpt?.source || null,
                  }))
                : [],
              signals: Array.isArray(page?.signals)
                ? page.signals.slice(0, 5).map((signal) => ({
                    type: signal?.type || null,
                    label: signal?.label || null,
                    value: signal?.value || null,
                  }))
                : [],
            }))
          : [],
        skipped: Array.isArray(result.skipped)
          ? result.skipped.slice(0, 20).map((item) => ({
              url: item?.url || null,
              reason: item?.reason || null,
            }))
          : [],
      };

    case PIPELINE_STAGES.EXTRACTION:
      return {
        total: result.total ?? (Array.isArray(result.extractions) ? result.extractions.length : 0),
        extractions: Array.isArray(result.extractions)
          ? result.extractions.slice(0, 10).map((extraction) => ({
              url: extraction?.url || extraction?.finalUrl || null,
              finalUrl: extraction?.finalUrl || null,
              title: extraction?.title || null,
              siteName: extraction?.siteName || null,
              status: extraction?.status ?? null,
              excerpts: Array.isArray(extraction?.excerpts)
                ? extraction.excerpts.slice(0, 5).map((excerpt) => ({
                    text: excerpt?.text || null,
                    source: excerpt?.source || null,
                  }))
                : [],
              signals: Array.isArray(extraction?.signals)
                ? extraction.signals.slice(0, 8).map((signal) => ({
                    type: signal?.type || null,
                    label: signal?.label || null,
                    value: signal?.value || null,
                  }))
                : [],
              claims: Array.isArray(extraction?.claims)
                ? extraction.claims.slice(0, 12).map((claim) => ({
                    text: claim?.text || claim?.claim || null,
                    type: claim?.type || null,
                  }))
                : [],
              entities: Array.isArray(extraction?.entities)
                ? extraction.entities.slice(0, 12).map((entity) => ({
                    name: entity?.name || null,
                    type: entity?.type || null,
                  }))
                : [],
              meta: extraction?.meta
                ? {
                    wordCount: extraction.meta.wordCount ?? null,
                    readingMinutes: extraction.meta.readingMinutes ?? null,
                  }
                : null,
            }))
          : [],
      };

    case PIPELINE_STAGES.BRIEF: {
      const evidence = result.evidence || result.evidencePack || null;
      return {
        summary: result.summary || result.executiveSummary || null,
        executiveSummary: Array.isArray(result.executiveSummary)
          ? result.executiveSummary.slice(0, 6).map((item) => String(item).slice(0, 300))
          : result.executiveSummary || null,
        evidence: evidence
          ? {
              companyName: evidence.companyName || null,
              urls: Array.isArray(evidence.urls) ? evidence.urls.slice(0, 8) : [],
              keyFacts: Array.isArray(evidence.keyFacts)
                ? evidence.keyFacts.slice(0, 10).map((fact) => String(fact).slice(0, 300))
                : [],
            }
          : null,
      };
    }

    case PIPELINE_STAGES.VERIFICATION:
      return {
        claims: Array.isArray(result.claims)
          ? result.claims.slice(0, 5).map((claim) => String(claim).slice(0, 240))
          : [],
        verdicts: Array.isArray(result.verifications || result.verdicts)
          ? (result.verifications || result.verdicts).slice(0, 5).map((item) => ({
              claim: item?.claim || null,
              status: item?.status || item?.verdict || null,
              confidence: item?.confidence ?? null,
            }))
          : [],
      };

    case PIPELINE_STAGES.LINKEDIN:
      return {
        company: result?.company
          ? {
              name: result.company.name || null,
              headline: result.company.headline || null,
              industry: result.company.industry || null,
              employeeCount: result.company.employeeCount ?? null,
              website: result.company.website || null,
            }
          : null,
        people: Array.isArray(result?.people)
          ? result.people.slice(0, 12).map((person) => ({
              name: person?.name || null,
              title: person?.title || null,
              linkedinUrl: person?.linkedinUrl || null,
            }))
          : [],
      };

    default:
      return result;
  }
}

/** Max string length and array length when writing payload to Sanity to avoid attribute/size limits */
const SANITY_PAYLOAD_MAX_STRING = 2000;
const SANITY_PAYLOAD_MAX_ARRAY = 100;
const SANITY_PAYLOAD_MAX_DEPTH = 12;

function trimValueForSanity(value, depth = 0) {
  if (depth > SANITY_PAYLOAD_MAX_DEPTH) return null;
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length <= SANITY_PAYLOAD_MAX_STRING ? value : value.slice(0, SANITY_PAYLOAD_MAX_STRING);
  }
  if (Array.isArray(value)) {
    const arr = value.slice(0, SANITY_PAYLOAD_MAX_ARRAY).map((item) => trimValueForSanity(item, depth + 1));
    return arr;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = trimValueForSanity(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function trimAccountPackPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return trimValueForSanity(payload);
}

function sanitizeResearchSet(researchSet) {
  if (!researchSet || typeof researchSet !== 'object') return researchSet;
  return {
    accountKey: researchSet.accountKey || null,
    canonicalUrl: researchSet.canonicalUrl || null,
    completedAt: researchSet.completedAt || null,
    pipelineJobId: researchSet.pipelineJobId || null,
    status: researchSet.status || null,
    scan: sanitizeStageResult(PIPELINE_STAGES.INITIAL_SCAN, researchSet.scan),
    discovery: sanitizeStageResult(PIPELINE_STAGES.DISCOVERY, researchSet.discovery),
    crawl: sanitizeStageResult(PIPELINE_STAGES.CRAWL, researchSet.crawl),
    evidence: sanitizeStageResult(PIPELINE_STAGES.EXTRACTION, researchSet.evidence),
    linkedin: sanitizeStageResult(PIPELINE_STAGES.LINKEDIN, researchSet.linkedin),
    brief: sanitizeStageResult(PIPELINE_STAGES.BRIEF, researchSet.brief),
    verification: sanitizeStageResult(PIPELINE_STAGES.VERIFICATION, researchSet.verification),
    stages: researchSet.stages || {
      completed: [],
      failed: [],
      total: 0,
    },
    summary: researchSet.summary || {
      pagesDiscovered: 0,
      pagesCrawled: 0,
      evidencePacks: 0,
      hasBrief: false,
      hasLinkedIn: false,
    },
  };
}

function normalizeJobDocument(job) {
  if (!job) return null;
  if (job._type === 'enrich.job') {
    return {
      ...job,
      jobId: job.jobId || job.jobKey || job._id,
      goalKey: job.goalKey || job.goal || 'full_pipeline',
      completedStages: Array.isArray(job.completedStages) ? job.completedStages : [],
      failedStages: Array.isArray(job.failedStages) ? job.failedStages : [],
      options: {
        includeLinkedIn: job.includeLinkedIn !== false,
        includeBrief: job.includeBrief !== false,
        includeVerification: job.includeVerification !== false,
        maxDepth: job.maxDepth || 2,
        budget: job.budget || 20,
        requestedStages: Array.isArray(job.requestedStages) ? job.requestedStages : [],
      },
      metadata: {
        createdBy: job.createdBy || 'system',
        source: job.source || 'background_enrichment',
      },
      startedAt: job.startedAt || job.createdAt || job._createdAt,
      updatedAt: job.updatedAt || job._updatedAt,
    };
  }
  return {
    ...job,
    jobId: job.jobId || job._id,
    completedStages: Array.isArray(job.completedStages) ? job.completedStages : [],
    failedStages: Array.isArray(job.failedStages) ? job.failedStages : [],
    options: job.options || {},
    metadata: job.metadata || {},
  };
}

function buildPackBackedJob(pack, enrichmentState = {}) {
  if (!pack?._id || !enrichmentState?.jobId) return null;
  return normalizeJobDocument({
    _id: enrichmentState.jobId,
    _type: 'accountPack.enrichmentState',
    packId: pack._id,
    accountKey: pack.accountKey,
    canonicalUrl: pack.canonicalUrl,
    jobId: enrichmentState.jobId,
    goalKey: enrichmentState.goalKey || 'full_pipeline',
    status: enrichmentState.status || 'pending',
    currentStage: enrichmentState.currentStage || PIPELINE_STAGES.INITIAL_SCAN,
    completedStages: enrichmentState.completedStages || [],
    failedStages: enrichmentState.failedStages || [],
    startedAt: enrichmentState.startedAt || enrichmentState.createdAt || pack.updatedAt || new Date().toISOString(),
    updatedAt: enrichmentState.updatedAt || pack.updatedAt || new Date().toISOString(),
    priority: enrichmentState.priority || 50,
      options: {
        includeLinkedIn: enrichmentState.includeLinkedIn !== false,
        includeBrief: enrichmentState.includeBrief !== false,
        includeVerification: enrichmentState.includeVerification !== false,
        maxDepth: enrichmentState.maxDepth || 2,
        budget: enrichmentState.budget || 20,
        requestedStages: Array.isArray(enrichmentState.requestedStages) ? enrichmentState.requestedStages : [],
      },
      metadata: {
        createdBy: enrichmentState.createdBy || 'system',
        source: enrichmentState.source || 'background_enrichment',
      },
  });
}

async function getAccountPack(groqQuery, client, accountKey) {
  try {
    return await groqQuery(client, `*[_type == "accountPack" && accountKey == $accountKey][0]`, { accountKey });
  } catch {
    return null;
  }
}

async function getAccountByKey(groqQuery, client, accountKey) {
  try {
    return await groqQuery(client, `*[_type == "account" && accountKey == $accountKey][0]`, { accountKey });
  } catch {
    return null;
  }
}

async function ensureAccountPack(groqQuery, upsertDocument, client, accountKey, canonicalUrl) {
  const existingPack = await getAccountPack(groqQuery, client, accountKey);
  if (existingPack?._id) return existingPack;
  const now = new Date().toISOString();
  const packDoc = {
    _type: 'accountPack',
    _id: `accountPack-${accountKey}`,
    accountKey,
    canonicalUrl,
    domain: (canonicalUrl && new URL(canonicalUrl).hostname.replace(/^www\./, '')) || '',
    payload: {},
    createdAt: now,
    updatedAt: now,
  };
  await upsertDocument(client, packDoc);
  return packDoc;
}

async function hydrateJobResults(groqQuery, upsertDocument, client, job) {
  const pack = await ensureAccountPack(groqQuery, upsertDocument, client, job.accountKey, job.canonicalUrl);
  const payload = pack?.payload || {};
  return {
    [PIPELINE_STAGES.INITIAL_SCAN]: payload.scan || payload.researchSet?.scan || null,
    [PIPELINE_STAGES.DISCOVERY]: payload.discovery || payload.researchSet?.discovery || null,
    [PIPELINE_STAGES.CRAWL]: payload.crawl || payload.researchSet?.crawl || null,
    [PIPELINE_STAGES.EXTRACTION]: payload.evidence || payload.researchSet?.evidence || null,
    [PIPELINE_STAGES.LINKEDIN]: payload.linkedin || payload.researchSet?.linkedin || null,
    [PIPELINE_STAGES.BRIEF]: payload.brief || payload.researchSet?.brief || null,
    [PIPELINE_STAGES.VERIFICATION]: payload.verification || payload.researchSet?.verification || null,
  };
}

function getCompletedStagesFromPayload(payload = {}) {
  const completed = [];
  if (payload.scan || payload.researchSet?.scan) completed.push(PIPELINE_STAGES.INITIAL_SCAN);
  if (payload.discovery || payload.researchSet?.discovery) completed.push(PIPELINE_STAGES.DISCOVERY);
  if (payload.crawl || payload.researchSet?.crawl) completed.push(PIPELINE_STAGES.CRAWL);
  if (payload.evidence || payload.researchSet?.evidence) completed.push(PIPELINE_STAGES.EXTRACTION);
  if (payload.linkedin || payload.researchSet?.linkedin) completed.push(PIPELINE_STAGES.LINKEDIN);
  if (payload.brief || payload.researchSet?.brief) completed.push(PIPELINE_STAGES.BRIEF);
  if (payload.verification || payload.researchSet?.verification) completed.push(PIPELINE_STAGES.VERIFICATION);
  return completed;
}

async function buildVirtualJobFromStoredState(groqQuery, upsertDocument, client, accountKey, env = null) {
  const [account, pack] = await Promise.all([
    getAccountByKey(groqQuery, client, accountKey),
    getAccountPack(groqQuery, client, accountKey),
  ]);
  const canonicalUrl = pack?.canonicalUrl || account?.canonicalUrl || (account?.domain ? `https://${account.domain}` : null) || (account?.rootDomain ? `https://${account.rootDomain}` : null);
  if (!canonicalUrl) return null;
  const payload = pack?.payload || {};
  const persistedState = (await readVirtualEnrichmentState(env, accountKey)) || payload.enrichmentState || {};
  const enrichmentState = (!payload.researchSet && ['complete', 'partial'].includes(persistedState.status))
    ? {}
    : persistedState;
  const job = createPipelineJob(canonicalUrl, { accountKey });
  job.jobId = enrichmentState.jobId || `virtual.${accountKey}`;
  job.results = {
    [PIPELINE_STAGES.INITIAL_SCAN]: payload.scan || payload.researchSet?.scan || null,
    [PIPELINE_STAGES.DISCOVERY]: payload.discovery || payload.researchSet?.discovery || null,
    [PIPELINE_STAGES.CRAWL]: payload.crawl || payload.researchSet?.crawl || null,
    [PIPELINE_STAGES.EXTRACTION]: payload.evidence || payload.researchSet?.evidence || null,
    [PIPELINE_STAGES.LINKEDIN]: payload.linkedin || payload.researchSet?.linkedin || null,
    [PIPELINE_STAGES.BRIEF]: payload.brief || payload.researchSet?.brief || null,
    [PIPELINE_STAGES.VERIFICATION]: payload.verification || payload.researchSet?.verification || null,
  };
  job.completedStages = Array.isArray(enrichmentState.completedStages) && enrichmentState.completedStages.length > 0
    ? enrichmentState.completedStages
    : getCompletedStagesFromPayload(payload);
  job.failedStages = Array.isArray(enrichmentState.failedStages) ? enrichmentState.failedStages : [];
  job.goalKey = enrichmentState.goalKey || job.goalKey;
  job.priority = enrichmentState.priority || job.priority;
  job.startedAt = enrichmentState.startedAt || job.startedAt;
  job.updatedAt = enrichmentState.updatedAt || job.updatedAt;
  job.status = enrichmentState.status || job.status;
  job.options = {
    ...job.options,
    requestedStages: Array.isArray(enrichmentState.requestedStages) ? enrichmentState.requestedStages : (job.options?.requestedStages || []),
    includeLinkedIn: enrichmentState.includeLinkedIn !== false,
    includeBrief: enrichmentState.includeBrief !== false,
    includeVerification: enrichmentState.includeVerification !== false,
    maxDepth: enrichmentState.maxDepth || job.options?.maxDepth || 2,
    budget: enrichmentState.budget || job.options?.budget || 20,
  };
  job.metadata = {
    ...job.metadata,
    source: enrichmentState.source || job.metadata?.source,
    createdBy: enrichmentState.createdBy || job.metadata?.createdBy,
  };
  const stageOrder = job.options?.requestedStages?.length ? job.options.requestedStages : [
    PIPELINE_STAGES.INITIAL_SCAN,
    PIPELINE_STAGES.DISCOVERY,
    PIPELINE_STAGES.CRAWL,
    PIPELINE_STAGES.EXTRACTION,
    PIPELINE_STAGES.LINKEDIN,
    PIPELINE_STAGES.BRIEF,
    PIPELINE_STAGES.VERIFICATION,
  ];
  const nextStage = stageOrder.find((stage) => !job.completedStages.includes(stage));
  job.currentStage = enrichmentState.currentStage || nextStage || PIPELINE_STAGES.COMPLETE;
  job.status = job.currentStage === PIPELINE_STAGES.COMPLETE
    ? 'complete'
    : (enrichmentState.status || (job.completedStages.length > 0 ? 'in_progress' : 'pending'));
  return job;
}

async function persistStageResult(groqQuery, upsertDocument, patchDocument, client, job, stage, result) {
  const payloadField = mapStageToPayloadField(stage);
  if (!payloadField) return;
  const pack = await ensureAccountPack(groqQuery, upsertDocument, client, job.accountKey, job.canonicalUrl);
  const existingPayload = pack?.payload || {};
  const nextPayload = {
    ...existingPayload,
    [payloadField]: sanitizeStageResult(stage, result),
  };
  await patchDocument(client, pack._id, {
    set: {
      payload: nextPayload,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function storePackBackedJob(client, patchDocument, pack, job) {
  const payload = trimAccountPackPayload({
    ...(pack?.payload || {}),
    enrichmentState: {
      jobId: job.jobId,
      goalKey: job.goalKey || 'full_pipeline',
      status: job.status,
      currentStage: job.currentStage,
      completedStages: job.completedStages || [],
      failedStages: job.failedStages || [],
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      priority: job.priority || 50,
      requestedStages: job.options?.requestedStages || [],
      includeLinkedIn: job.options?.includeLinkedIn !== false,
      includeBrief: job.options?.includeBrief !== false,
      includeVerification: job.options?.includeVerification !== false,
      maxDepth: job.options?.maxDepth || 2,
      budget: job.options?.budget || 20,
      source: job.metadata?.source || 'background_enrichment',
      createdBy: job.metadata?.createdBy || 'system',
    },
  });
  await patchDocument(client, pack._id, {
    set: {
      payload,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Queue enrichment job for account
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {string} canonicalUrl - Account canonical URL
 * @param {string} accountKey - Account key
 * @param {object} options - Enrichment options
 * @returns {Promise<{success: boolean, jobId: string}>}
 */
export async function queueEnrichmentJob(
  groqQuery,
  upsertDocument,
  client,
  canonicalUrl,
  accountKey,
  options = {}
) {
  const goalKey = options.goalKey || (Array.isArray(options.requestedStages) && options.requestedStages.length > 0
    ? `stages:${[...new Set(options.requestedStages)].sort().join('+')}`
    : 'full_pipeline');
  // Check if enrichment already in progress
  const existingJob = await getActiveEnrichmentJob(groqQuery, client, accountKey, goalKey);
  if (existingJob) {
    return {
      success: true,
      jobId: existingJob.jobId,
      status: existingJob.status,
      message: 'Enrichment already in progress',
    };
  }
  
  // Create pipeline job
  const job = createPipelineJob(canonicalUrl, {
    accountKey,
    goalKey,
    ...options,
  });
  
  // Store job in Sanity
  const jobDoc = {
    _type: 'enrich.job',
    _id: job.jobId,
    jobId: job.jobId,
    jobKey: job.jobId,
    accountKey,
    canonicalUrl,
    entityType: 'account',
    entityId: accountKey,
    goal: goalKey,
    status: job.status,
    currentStage: job.currentStage,
    completedStages: job.completedStages,
    failedStages: job.failedStages,
    startedAt: job.startedAt,
    createdAt: job.startedAt,
    updatedAt: job.updatedAt,
    priority: job.priority,
    goalKey: job.goalKey || goalKey,
    requestedStages: job.options?.requestedStages || [],
    includeLinkedIn: job.options?.includeLinkedIn !== false,
    includeBrief: job.options?.includeBrief !== false,
    includeVerification: job.options?.includeVerification !== false,
    maxDepth: job.options?.maxDepth || 2,
    budget: job.options?.budget || 20,
    source: job.metadata?.source || 'background_enrichment',
    createdBy: job.metadata?.createdBy || 'system',
  };

  try {
    await upsertDocument(client, jobDoc);
  } catch (error) {
    const message = String(error?.message || '');
    if (!/attribute\/datatype count|validationError/i.test(message)) {
      throw error;
    }

    const pack = await ensureAccountPack(groqQuery, upsertDocument, client, accountKey, canonicalUrl);
    await storePackBackedJob(client, patchDocumentShim(upsertDocument), pack, job);
  }
  
  // Trigger first stage execution (async, non-blocking)
  // Note: In production, this would be handled by a background worker
  // For now, we'll execute stages on-demand via API
  
  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
  };
}

/**
 * Get active enrichment job for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>}
 */
export async function getActiveEnrichmentJob(groqQuery, client, accountKey, goalKey = null, env = null) {
  try {
    let query = `*[_type == "enrich.job" && accountKey == $accountKey && status in ["pending", "in_progress"]]`;
    const params = { accountKey };
    if (goalKey) {
      query += ` && goalKey == $goalKey`;
      params.goalKey = goalKey;
    }
    query += ` | order(updatedAt desc)[0]`;
    const raw = await groqQuery(client, query, params);
    const job = Array.isArray(raw) && raw.length > 0 ? raw[0] : (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null);
    if (job) {
      return normalizeJobDocument(job);
    }

    const virtualJob = await buildVirtualJobFromStoredState(groqQuery, null, client, accountKey, env);
    if (virtualJob && ['pending', 'in_progress'].includes(virtualJob.status)) {
      if (goalKey && virtualJob.goalKey !== goalKey) return null;
      return virtualJob;
    }

    const pack = await getAccountPack(groqQuery, client, accountKey);
    const packJob = buildPackBackedJob(pack, pack?.payload?.enrichmentState || null);
    if (!packJob) return null;
    if (!['pending', 'in_progress'].includes(packJob.status)) return null;
    if (goalKey && packJob.goalKey !== goalKey) return null;
    return packJob;
  } catch (e) {
    return null;
  }
}

/**
 * Get enrichment job by ID
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} jobId - Job ID
 * @returns {Promise<object|null>}
 */
export async function getEnrichmentJob(groqQuery, client, jobId) {
  try {
    const query = `*[_id == $jobId][0]`;
    const raw = await groqQuery(client, query, { jobId });
    const job = Array.isArray(raw) && raw.length > 0 ? raw[0] : (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null);
    if (job) {
      return normalizeJobDocument(job);
    }

    const pack = await groqQuery(client, `*[_type == "accountPack" && payload.enrichmentState.jobId == $jobId][0]`, { jobId });
    return buildPackBackedJob(pack, pack?.payload?.enrichmentState || null);
  } catch (e) {
    return null;
  }
}

/**
 * Execute next stage of enrichment job
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {object} client - Sanity client
 * @param {string} jobId - Job ID
 * @param {object} context - Execution context (handlers, etc.)
 * @returns {Promise<{success: boolean, job: object, completed: boolean}>}
 */
export async function executeEnrichmentStage(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  jobId,
  context
) {
  // Get job
  const job = await getEnrichmentJob(groqQuery, client, jobId);
  if (!job) {
    throw new Error('Enrichment job not found');
  }
  job.results = await hydrateJobResults(groqQuery, upsertDocument, client, job);
  
  if (['complete', 'partial'].includes(job.status)) {
    return {
      success: true,
      job,
      completed: true,
    };
  }
  
  // Execute next stage
  const { job: updatedJob, completed, lastStage, lastStageResult, lastStageSucceeded } = await executeNextPipelineStage(job, context);
  if (lastStageSucceeded) {
    await persistStageResult(groqQuery, upsertDocument, patchDocument, client, updatedJob, lastStage, lastStageResult);
  }
  
  // Update job in Sanity
  const nextJobPatch = job._type === 'enrich.job'
    ? {
        set: {
          status: updatedJob.status,
          currentStage: updatedJob.currentStage,
          completedStages: updatedJob.completedStages,
          failedStages: updatedJob.failedStages,
          updatedAt: updatedJob.updatedAt,
          goal: updatedJob.goalKey || job.goalKey || null,
          goalKey: updatedJob.goalKey || job.goalKey || null,
          requestedStages: updatedJob.options?.requestedStages || [],
          includeLinkedIn: updatedJob.options?.includeLinkedIn !== false,
          includeBrief: updatedJob.options?.includeBrief !== false,
          includeVerification: updatedJob.options?.includeVerification !== false,
          maxDepth: updatedJob.options?.maxDepth || 2,
          budget: updatedJob.options?.budget || 20,
          source: updatedJob.metadata?.source || job.source || 'background_enrichment',
          createdBy: updatedJob.metadata?.createdBy || job.createdBy || 'system',
        },
      }
    : {
        set: {
          status: updatedJob.status,
          currentStage: updatedJob.currentStage,
          completedStages: updatedJob.completedStages,
          failedStages: updatedJob.failedStages,
          results: updatedJob.results,
          updatedAt: updatedJob.updatedAt,
          goalKey: updatedJob.goalKey || job.goalKey || null,
        },
      };

  if (job._type === 'accountPack.enrichmentState' && job.packId) {
    await storePackBackedJob(client, patchDocument, { _id: job.packId, payload: (await getAccountPack(groqQuery, client, job.accountKey))?.payload || {} }, updatedJob);
  } else {
    await patchDocument(client, jobId, nextJobPatch);
  }
  
  // If complete, build and store research set
  if (completed) {
    const researchSet = sanitizeResearchSet(buildCompleteResearchSet(updatedJob));
    
    // Store complete research set in accountPack
    const packId = `accountPack-${updatedJob.accountKey}`;
    try {
      // Get existing pack to preserve payload structure
      const sanityClient = await import('../sanity-client.js');
      const existingPack = sanityClient.getDocument ? await sanityClient.getDocument(client, packId) : null;
      
      // Merge researchSet into existing payload
      const existingPayload = existingPack?.payload || {};
      const updatedPayload = trimAccountPackPayload({
        ...existingPayload,
        scan: researchSet.scan || existingPayload.scan || null,
        discovery: researchSet.discovery || existingPayload.discovery || null,
        crawl: researchSet.crawl || existingPayload.crawl || null,
        evidence: researchSet.evidence || existingPayload.evidence || null,
        linkedin: researchSet.linkedin || existingPayload.linkedin || null,
        brief: researchSet.brief || existingPayload.brief || null,
        verification: researchSet.verification || existingPayload.verification || null,
        researchSet: researchSet,
        enrichmentCompletedAt: new Date().toISOString(),
      });
      const payloadWithState =
        job._type === 'accountPack.enrichmentState'
          ? {
              ...updatedPayload,
              enrichmentState: {
                ...(existingPayload.enrichmentState || {}),
                jobId: updatedJob.jobId,
                goalKey: updatedJob.goalKey || job.goalKey || 'full_pipeline',
                status: updatedJob.status,
                currentStage: updatedJob.currentStage,
                completedStages: updatedJob.completedStages || [],
                failedStages: updatedJob.failedStages || [],
                startedAt: updatedJob.startedAt,
                updatedAt: updatedJob.updatedAt,
                priority: updatedJob.priority || 50,
                requestedStages: updatedJob.options?.requestedStages || [],
                includeLinkedIn: updatedJob.options?.includeLinkedIn !== false,
                includeBrief: updatedJob.options?.includeBrief !== false,
                includeVerification: updatedJob.options?.includeVerification !== false,
                maxDepth: updatedJob.options?.maxDepth || 2,
                budget: updatedJob.options?.budget || 20,
                source: updatedJob.metadata?.source || 'background_enrichment',
                createdBy: updatedJob.metadata?.createdBy || 'system',
              },
            }
          : updatedPayload;

      await patchDocument(client, packId, {
        set: {
          payload: trimAccountPackPayload(payloadWithState),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error('Failed to store research set:', e);
      throw e; // Re-throw to let caller handle
    }
    
    // ── Trigger classification + competitor research + completeness update ──
    // This is the callback that turns a partial profile into a complete one.
    try {
      const { onEnrichmentComplete } = await import('./gap-fill-orchestrator.js');
      await onEnrichmentComplete(groqQuery, upsertDocument, patchDocument, client, updatedJob.accountKey);
    } catch (classifyErr) {
      console.error('Post-enrichment classification error:', classifyErr);
      // Don't fail the enrichment for this
    }
  }
  
  return {
    success: true,
    job: updatedJob,
    completed,
  };
}

function patchDocumentShim(upsertDocument) {
  return async (client, packId, operations) => {
    const packIdValue = typeof packId === 'string' ? packId : packId?._id;
    if (!packIdValue) {
      throw new Error('accountPack id required');
    }
    const existingPack = await getDocumentForPatch(client, packIdValue);
    const nextPayload = trimAccountPackPayload(operations?.set?.payload || existingPack?.payload || {});
    return upsertDocument(client, {
      ...(existingPack || { _type: 'accountPack', _id: packIdValue }),
      payload: nextPayload,
      updatedAt: operations?.set?.updatedAt || new Date().toISOString(),
    });
  };
}

async function getDocumentForPatch(client, id) {
  const { getDocument } = await import('../sanity-client.js');
  return getDocument(client, id);
}

/**
 * Get complete research set for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>}
 */
export async function getCompleteResearchSet(groqQuery, client, accountKey) {
  try {
    // Get accountPack with research set
    const packId = `accountPack-${accountKey}`;
    const query = `*[_id == $packId][0]`;
    const raw = await groqQuery(client, query, { packId });
    const pack = Array.isArray(raw) && raw.length ? raw[0] : raw;
    
    if (!pack || !pack.payload?.researchSet) {
      return null;
    }
    
    return pack.payload.researchSet;
  } catch (e) {
    return null;
  }
}

/**
 * Get enrichment status for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object>}
 */
export async function getEnrichmentStatus(groqQuery, client, accountKey, env = null) {
  // Check for active job
  const activeJob = await getActiveEnrichmentJob(groqQuery, client, accountKey, null, env);
  
  // Check for complete research set
  const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
  
  if (activeJob) {
    const progress = getPipelineProgress(activeJob);
    return {
      status: 'in_progress',
      jobId: activeJob.jobId || activeJob._id,
      progress: progress.progress,
      currentStage: progress.currentStage,
      estimatedTimeRemaining: progress.estimatedTimeRemaining,
      hasResearchSet: false,
    };
  } else if (researchSet) {
    return {
      status: 'complete',
      jobId: researchSet.pipelineJobId,
      progress: 100,
      completedAt: researchSet.completedAt,
      hasResearchSet: true,
      summary: researchSet.summary,
    };
  } else {
    const virtualJob = await buildVirtualJobFromStoredState(groqQuery, null, client, accountKey, env);
    if (virtualJob && virtualJob.completedStages.length > 0 && virtualJob.status !== 'complete') {
      const progress = getPipelineProgress(virtualJob);
      return {
        status: 'in_progress',
        jobId: virtualJob.jobId,
        progress: progress.progress,
        currentStage: progress.currentStage,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
        hasResearchSet: false,
      };
    }
    return {
      status: 'not_started',
      hasResearchSet: false,
    };
  }
}

export async function executeVirtualEnrichmentStage(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  accountKey,
  context
) {
  let job = await buildVirtualJobFromStoredState(groqQuery, upsertDocument, client, accountKey, context?.env || null);
  if (!job) {
    throw new Error('Virtual enrichment job could not be built');
  }
  const pack = await ensureAccountPack(groqQuery, upsertDocument, client, accountKey, job.canonicalUrl);
  if (['complete', 'partial'].includes(job.status)) {
    return { success: true, job, completed: true };
  }

  let completed = false;
  let safetyCounter = 0;

  while (!completed && safetyCounter < 8) {
    const stageExecution = await executeNextPipelineStage(job, context);
    job = stageExecution.job;
    completed = stageExecution.completed;
    if (stageExecution.lastStageSucceeded && stageExecution.lastStage) {
      job.results = {
        ...(job.results || {}),
        [stageExecution.lastStage]: stageExecution.lastStageResult,
      };
    }
    safetyCounter += 1;
  }

  await writeVirtualEnrichmentState(context?.env || null, job);

  if (completed) {
    const researchSet = sanitizeResearchSet(buildCompleteResearchSet(job));
    const { getDocument } = await import('../sanity-client.js');
    const existingPack = await getDocument(client, pack._id);
    const existingPayload = existingPack?.payload || {};
    const updatedPayload = trimAccountPackPayload({
      ...existingPayload,
      scan: researchSet.scan || null,
      discovery: researchSet.discovery || null,
      crawl: researchSet.crawl || null,
      evidence: researchSet.evidence || null,
      linkedin: researchSet.linkedin || null,
      brief: researchSet.brief || null,
      verification: researchSet.verification || null,
      researchSet,
      enrichmentCompletedAt: new Date().toISOString(),
    });
    await patchDocument(client, pack._id, {
      set: {
        payload: updatedPayload,
        updatedAt: new Date().toISOString(),
      },
    });

    try {
      const { onEnrichmentComplete } = await import('./gap-fill-orchestrator.js');
      await onEnrichmentComplete(groqQuery, upsertDocument, patchDocument, client, job.accountKey);
    } catch (classifyErr) {
      console.error('Post-enrichment classification error:', classifyErr);
    }
    await clearVirtualEnrichmentState(context?.env || null, job.accountKey);
  }

  return {
    success: true,
    job,
    completed,
  };
}

/**
 * List all enrichment jobs
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} filters - Filters (status, accountKey, limit)
 * @returns {Promise<Array<object>>}
 */
export async function listEnrichmentJobs(groqQuery, client, filters = {}) {
  let query = `*[_type in ${ENRICHMENT_JOB_TYPES}`;
  
  if (filters.status) {
    query += ` && status == $status`;
  }
  
  if (filters.accountKey) {
    query += ` && accountKey == $accountKey`;
  }
  
  query += ']';
  query += ' | order(updatedAt desc)';
  
  const limit = filters.limit || 50;
  query += `[0...${limit}]`;
  
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.accountKey) params.accountKey = filters.accountKey;
  
  const jobs = await groqQuery(client, query, params);
  return jobs || [];
}

/**
 * Auto-enrich account (triggered automatically)
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @param {string} canonicalUrl - Canonical URL
 * @returns {Promise<{success: boolean, jobId?: string, message: string}>}
 */
export async function autoEnrichAccount(
  groqQuery,
  upsertDocument,
  client,
  accountKey,
  canonicalUrl
) {
  // Check if already enriched
  const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
  if (researchSet) {
    return {
      success: true,
      message: 'Account already enriched',
      hasResearchSet: true,
    };
  }
  
  // Check if enrichment in progress
  const activeJob = await getActiveEnrichmentJob(groqQuery, client, accountKey);
  if (activeJob) {
    return {
      success: true,
      jobId: activeJob.jobId,
      message: 'Enrichment already in progress',
      status: activeJob.status,
    };
  }
  
  // Queue enrichment
  return await queueEnrichmentJob(
    groqQuery,
    upsertDocument,
    client,
    canonicalUrl,
    accountKey,
    {
      priority: 50,
      source: 'auto_enrichment',
    }
  );
}

