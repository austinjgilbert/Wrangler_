/**
 * MoltBot Sanity Helpers
 * Uses the existing Sanity client wrapper in this worker.
 *
 * This module consolidates both the original moltbot sanity helpers (formerly sanity.js)
 * and the unified molt/dq/network/call/community sanity helpers (formerly sanity.ts).
 */

import {
  assertSanityConfigured,
  groqQuery,
  upsertDocument,
  patchDocument,
  getDocument,
} from '../sanity-client.js';

// ---------------------------------------------------------------------------
// Shared client helper
// ---------------------------------------------------------------------------

export function getSanityClient(env: any): any {
  return assertSanityConfigured(env);
}

// ---------------------------------------------------------------------------
// MoltBot helpers (migrated from sanity.js)
// ---------------------------------------------------------------------------

export async function fetchLatestMoltbotConfig(env: any): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "moltbot.config"] | order(_updatedAt desc)[0]';
  const result = await groqQuery(client, query);
  return result || null;
}

export async function fetchLatestDocumentByType(env: any, type: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == $type] | order(_updatedAt desc, _createdAt desc)[0]';
  const result = await groqQuery(client, query, { type });
  return result || null;
}

export async function fetchDocumentsByType(env: any, type: string, limit: number = 50): Promise<any[]> {
  const client = getSanityClient(env);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const query = `*[_type == $type] | order(_updatedAt desc, _createdAt desc)[0...${safeLimit}]`;
  const result = await groqQuery(client, query, { type });
  return Array.isArray(result) ? result : [];
}

export async function createMoltbotRequest(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function updateMoltbotRequest(env: any, id: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, id, { set: updates });
}

export async function createMoltbotArtifact(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createMoltbotApproval(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function updateMoltbotApproval(env: any, id: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, id, { set: updates });
}

export async function getMoltbotApproval(env: any, id: string): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, id);
}

export async function createMoltbotTask(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchContextArtifacts(env: any, entityHints: string[] = [], limit: number = 5): Promise<any[]> {
  const client = getSanityClient(env);
  if (!entityHints || entityHints.length === 0) return [];

  const clauses = entityHints.map((_: string, idx: number) => `content match $term${idx}`);
  const query = `*[_type == "moltbot.artifact" && (${clauses.join(' || ')})] | order(_createdAt desc)[0...${limit}]`;
  const params: Record<string, string> = {};
  entityHints.forEach((term: string, idx: number) => {
    params[`term${idx}`] = term;
  });

  const result = await groqQuery(client, query, params);
  return Array.isArray(result) ? result : [];
}

// ---------------------------------------------------------------------------
// Unified Molt helpers (originally in sanity.ts)
// ---------------------------------------------------------------------------

export async function createMoltApproval(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchMoltApprovalById(env: any, approvalId: string): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, approvalId);
}

export async function updateMoltApproval(env: any, approvalId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, approvalId, { set: updates });
}

export async function createMoltEvent(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchMoltEventById(env: any, eventId: string): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, eventId);
}

export async function createMoltJob(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchQueuedMoltJobs(
  env: any,
  options: {
    limit?: number;
    jobTypes?: string[];
  } = {},
): Promise<any[]> {
  const client = getSanityClient(env);
  const now = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(options.limit || 25, 25));
  const jobTypeClause = Array.isArray(options.jobTypes) && options.jobTypes.length > 0
    ? ' && jobType in $jobTypes'
    : '';
  const query = `*[
    _type == "molt.job" &&
    status == "queued" &&
    (nextAttemptAt == null || nextAttemptAt <= $now) &&
    (leaseExpiresAt == null || leaseExpiresAt <= $now)
    ${jobTypeClause}
  ] | order(priority desc, createdAt asc)[0...${safeLimit}]`;
  const result = await groqQuery(client, query, {
    now,
    jobTypes: options.jobTypes || [],
  });
  return Array.isArray(result) ? result : [];
}

export async function updateMoltJob(env: any, id: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, id, { set: updates });
}

export async function createMoltNotification(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createActionCandidate(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchActionCandidateById(env: any, actionCandidateId: string): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, actionCandidateId);
}

export async function fetchLatestGmailDraftForActionCandidate(env: any, actionCandidateId: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "gmailDraft" && actionCandidateId == $actionCandidateId] | order(coalesce(sentAt, updatedAt, createdAt) desc, _updatedAt desc)[0]';
  const result = await groqQuery(client, query, { actionCandidateId });
  return result || null;
}

export async function createOperatorFeedback(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchOperatorFeedbackForActionCandidate(env: any, actionCandidateId: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "operatorFeedback" && actionCandidateId == $actionCandidateId] | order(timestamp desc)';
  const result = await groqQuery(client, query, { actionCandidateId });
  return Array.isArray(result) ? result : [];
}

export async function fetchActionCandidates(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "actionCandidate"] | order(_updatedAt desc)';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function updateActionCandidate(env: any, actionCandidateId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, actionCandidateId, { set: updates });
}

export async function fetchActiveActionCandidatesForAccount(env: any, accountRef: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = `*[
    _type == "actionCandidate" &&
    account._ref == $accountRef &&
    (!defined(lifecycleStatus) || lifecycleStatus == "active")
  ] | order(opportunityScore desc, _updatedAt desc)`;
  const result = await groqQuery(client, query, { accountRef });
  return Array.isArray(result) ? result : [];
}

export async function fetchSignalsForActionCandidate(env: any, params: {
  accountRef?: string | null;
  personRef?: string | null;
}): Promise<any[]> {
  const client = getSanityClient(env);
  const clauses = ['_type == "signal"'];
  if (params.accountRef && params.personRef) {
    clauses.push('(account._ref == $accountRef || person._ref == $personRef)');
  } else if (params.accountRef) {
    clauses.push('account._ref == $accountRef');
  } else if (params.personRef) {
    clauses.push('person._ref == $personRef');
  }
  const query = `*[${clauses.join(' && ')}] | order(timestamp desc, _updatedAt desc)[0...50]`;
  const result = await groqQuery(client, query, {
    accountRef: params.accountRef || null,
    personRef: params.personRef || null,
  });
  return Array.isArray(result) ? result : [];
}

export async function fetchSignals(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "signal"] | order(timestamp desc, _updatedAt desc)[0...2000]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function fetchPatternByType(env: any, patternType: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "molt.pattern" && patternType == $patternType][0]';
  const result = await groqQuery(client, query, { patternType });
  return result || null;
}

export async function upsertMoltPattern(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createMetricSnapshot(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createScoringPolicyVersion(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createPatternVersion(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createDraftPolicyVersion(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createStrategyInstructionVersion(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createOutcomeEvent(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchOutcomeEventsForActionCandidate(env: any, actionCandidateId: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "outcomeEvent" && actionCandidateId == $actionCandidateId] | order(observedAt desc, _updatedAt desc)';
  const result = await groqQuery(client, query, { actionCandidateId });
  return Array.isArray(result) ? result : [];
}

export async function createDriftMetric(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createScenarioRun(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createFlowExperience(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createRepairAttempt(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createAutonomyPolicy(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createRuntimeIncident(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function updateRuntimeIncident(env: any, incidentId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, incidentId, { set: updates });
}

export async function createBestKnownPath(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createScenarioConfidenceSnapshot(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchDriftMetricsByType(env: any, metricType: string, limit: number = 50): Promise<any[]> {
  const client = getSanityClient(env);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const query = `*[_type == "driftMetric" && metricType == $metricType] | order(observedAt desc, _updatedAt desc)[0...${safeLimit}]`;
  const result = await groqQuery(client, query, { metricType });
  return Array.isArray(result) ? result : [];
}

export async function createLearningRecord(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createUserPatternRecord(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function updateMoltbotConfig(env: any, configId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, configId, { set: updates });
}

export async function fetchDocumentsByIds(env: any, ids: string[]): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_id in $ids]';
  const result = await groqQuery(client, query, { ids });
  return Array.isArray(result) ? result : [];
}

// ---------------------------------------------------------------------------
// DQ / Enrich helpers
// ---------------------------------------------------------------------------

export async function fetchAccounts(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "account"]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function fetchPeople(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "person"]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function fetchTechnologies(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "technology"]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function createDqFinding(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createEnrichJob(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchQueuedEnrichJobs(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const now = new Date().toISOString();
  const query = `*[
    _type == "enrich.job" &&
    status == "queued" &&
    (!defined(nextAttemptAt) || nextAttemptAt <= $now) &&
    (!defined(leaseExpiresAt) || leaseExpiresAt <= $now)
  ] | order(priority desc, createdAt asc)[0...25]`;
  const result = await groqQuery(client, query, { now });
  return Array.isArray(result) ? result : [];
}

export async function updateEnrichJob(env: any, id: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, id, { set: updates });
}

export async function createEnrichProposal(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchProposalById(env: any, proposalId: any): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, proposalId);
}

export async function patchEntity(env: any, entityId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, entityId, { set: updates });
}

export async function updateEnrichProposal(env: any, proposalId: any, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, proposalId, { set: updates });
}

export async function createCrawlSnapshot(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Network / Person helpers
// ---------------------------------------------------------------------------

export async function upsertNetworkPerson(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchCompanies(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "company"]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function fetchNetworkPeople(env: any): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "networkPerson"]';
  const result = await groqQuery(client, query);
  return Array.isArray(result) ? result : [];
}

export async function createSignal(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createConversationStarter(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createDailyBriefing(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchRecentStarters(env: any, sinceIso: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "conversationStarter" && _createdAt >= $since] | order(_createdAt desc)';
  const result = await groqQuery(client, query, { since: sinceIso });
  return Array.isArray(result) ? result : [];
}

export async function findPersonByLinkedinUrl(env: any, linkedinUrl: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "person" && linkedinUrl == $linkedinUrl][0]';
  const result = await groqQuery(client, query, { linkedinUrl });
  return result || null;
}

export async function findPersonByName(env: any, name: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "person" && name == $name][0]';
  const result = await groqQuery(client, query, { name });
  return result || null;
}

export async function upsertPersonPlaceholder(env: any, data: { name?: string; linkedinUrl?: string }): Promise<any> {
  const client = getSanityClient(env);
  const id = `person.placeholder.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  const doc = {
    _type: 'person',
    _id: id,
    name: data.name || 'Unknown',
    linkedinUrl: data.linkedinUrl || null,
    needsEnrichment: true,
    createdAt: new Date().toISOString(),
  };
  await upsertDocument(client, doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Account lookup / placeholder helpers (entityResolver)
// ---------------------------------------------------------------------------

export async function findAccountByDomain(env: any, domain: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "account" && domain == $domain][0]';
  const result = await groqQuery(client, query, { domain });
  return result || null;
}

export async function findAccountByName(env: any, name: string): Promise<any> {
  const client = getSanityClient(env);
  const query = '*[_type == "account" && name == $name][0]';
  const result = await groqQuery(client, query, { name });
  return result || null;
}

export async function upsertAccountPlaceholder(env: any, domain: string): Promise<any> {
  const client = getSanityClient(env);
  const id = `account.placeholder.${domain.replace(/[^a-z0-9]/gi, '-')}`;
  const doc = {
    _type: 'account',
    _id: id,
    domain,
    name: domain,
    needsEnrichment: true,
    createdAt: new Date().toISOString(),
  };
  await upsertDocument(client, doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Call session helpers
// ---------------------------------------------------------------------------

export async function createCallSession(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createCallInsight(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createCallTask(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createCallCoaching(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createCallFollowupDraft(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchCallSessionById(env: any, sessionId: string): Promise<any> {
  const client = getSanityClient(env);
  return await getDocument(client, sessionId);
}

export async function updateCallSession(env: any, sessionId: string, updates: any): Promise<void> {
  const client = getSanityClient(env);
  await patchDocument(client, sessionId, { set: updates });
}

// ---------------------------------------------------------------------------
// Opportunity helpers
// ---------------------------------------------------------------------------

export async function createOpportunityBrief(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createOpportunity(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createDraftAction(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchCommunityPostSanitizedSince(env: any, sinceIso: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "communityPostSanitized" && _createdAt >= $since] | order(_createdAt desc)';
  const result = await groqQuery(client, query, { since: sinceIso });
  return Array.isArray(result) ? result : [];
}

export async function createStrategyBrief(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Moltbook / Community helpers
// ---------------------------------------------------------------------------

export async function createCommunityPostRaw(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function createCommunityPostSanitized(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}

export async function fetchCommunityPostRawSince(env: any, sinceIso: string): Promise<any[]> {
  const client = getSanityClient(env);
  const query = '*[_type == "communityPostRaw" && fetchedAt >= $since] | order(fetchedAt desc)';
  const result = await groqQuery(client, query, { since: sinceIso });
  return Array.isArray(result) ? result : [];
}

/** Recent community posts (raw + sanitized summary when present) for network insights. */
export async function fetchRecentCommunityPostsForSummary(
  env: any,
  opts: { limit?: number; sinceHours?: number } = {},
): Promise<any[]> {
  const client = getSanityClient(env);
  const limit = Math.min(opts.limit ?? 15, 50);
  const sinceHours = opts.sinceHours ?? 168; // 7 days default
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  const query = `*[_type == "communityPostRaw" && fetchedAt >= $since] | order(fetchedAt desc)[0...$limit]{
    _id,
    externalId,
    author,
    rawText,
    fetchedAt,
    url,
    "sanitized": *[_type == "communityPostSanitized" && rawRef._ref == ^._id][0]{ sanitizedSummary, extractedTopics, riskLevel }
  }`;
  const result = await groqQuery(client, query, { since: sinceIso, limit });
  return Array.isArray(result) ? result : [];
}

export async function createCommunitySource(env: any, doc: any): Promise<any> {
  const client = getSanityClient(env);
  await upsertDocument(client, doc);
  return doc;
}
