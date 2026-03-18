/**
 * User Action Logger Service
 * Logs every user action, prompt, and enrichment summary for learning/patterns
 */

import { extractQueryPatterns } from './learning-service.js';
import { storeInteraction as storeLearningInteraction } from './learning-storage.js';
import { storeUserPattern } from './user-pattern-metadata.js';
import { extractUserFromRequest } from './usage-logger.js';
import { readJsonBody, buildPromptFromBody } from './usage-utils.js';

async function readJsonResponse(response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function pickFirstValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function summarizeTechStack(techStack) {
  if (!techStack || typeof techStack !== 'object') return null;
  const summary = {};
  const keys = ['cms', 'frameworks', 'libraries', 'analytics', 'commerce', 'hosting', 'security', 'tagManagers', 'cdns', 'legacySystems'];
  for (const key of keys) {
    if (Array.isArray(techStack[key]) && techStack[key].length > 0) {
      summary[key] = techStack[key].slice(0, 8);
    }
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function buildEnrichmentSummary(responseData) {
  if (!responseData || typeof responseData !== 'object') return null;

  const data = responseData.data || responseData;
  const account = data.account || data.profile?.account || null;
  const techStack = data.technologyStack || account?.technologyStack || data.scan?.technologyStack || null;
  const personBrief = data.personBrief || null;

  const summary = {
    accountKey: data.accountKey || account?.accountKey || null,
    accountDomain: data.domain || account?.domain || null,
    personId: data.personId || null,
    briefId: data.briefId || null,
    evidenceCount: Array.isArray(data.evidenceIds) ? data.evidenceIds.length : null,
    verificationId: data.verificationId || null,
    enrichmentStatus: data.enrichment?.status || null,
    enrichmentTriggered: data.enrichment?.triggered || null,
    enrichmentJobId: data.enrichment?.jobId || null,
    confidenceScore: personBrief?.opportunityConfidence?.score || null,
    confidenceLevel: personBrief?.opportunityConfidence?.confidence || null,
    techSummary: summarizeTechStack(techStack),
  };

  const cleaned = Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== null && value !== undefined)
  );

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function buildActionContext(body, url, responseData) {
  const responseSummary = buildEnrichmentSummary(responseData);
  const accountKey = pickFirstValue([
    body?.accountKey,
    body?.account?.accountKey,
    responseSummary?.accountKey,
    responseData?.data?.accountKey,
  ]);

  const accountDomain = pickFirstValue([
    body?.accountDomain,
    body?.domain,
    responseSummary?.accountDomain,
    responseData?.data?.account?.domain,
  ]);

  const personId = pickFirstValue([
    body?.personId,
    responseSummary?.personId,
    responseData?.data?.personId,
  ]);

  const canonicalUrl = pickFirstValue([
    body?.canonicalUrl,
    body?.url,
    url.searchParams.get('url'),
    responseData?.data?.canonicalUrl,
    responseData?.data?.account?.canonicalUrl,
  ]);

  return {
    accountKey,
    accountDomain,
    personId,
    canonicalUrl,
    enrichmentSummary: responseSummary,
    techSummary: responseSummary?.techSummary || null,
  };
}

function buildPatternContext(context) {
  if (!context) return {};
  return {
    account: context.canonicalUrl ? { canonicalUrl: context.canonicalUrl } : null,
  };
}

export async function logUserAction(request, url, requestId, env, response, startTime, responseBodyText = null) {
  if (env?.ENABLE_REQUEST_LOGGING !== '1') {
    return null;
  }
  try {
    const { initSanityClient, groqQuery, upsertDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) return null;

    const userInfo = extractUserFromRequest(request);
    const body = await readJsonBody(request);
    const responseData = responseBodyText != null
      ? (() => { try { return JSON.parse(responseBodyText); } catch { return null; } })()
      : await readJsonResponse(response.clone());

    const prompt = buildPromptFromBody(body, url);
    const context = buildActionContext(body, url, responseData);
    const patterns = extractQueryPatterns(prompt || '', buildPatternContext(context));

    const durationMs = Date.now() - startTime;
    const success = response.status >= 200 && response.status < 300;
    const outcome = success ? 'success' : 'failure';
    const action = url.pathname;

    await storeLearningInteraction(
      groqQuery,
      upsertDocument,
      client,
      {
        accountKey: context.accountKey || null,
        accountDomain: context.accountDomain || null,
        query: prompt || '',
        patterns,
        action,
        nextAction: null,
        outcome,
        responseTime: durationMs,
        userId: userInfo.userId || 'anonymous',
        sessionId: body?.sessionId || null,
        metadata: {
          requestId,
          method: request.method,
          accountKey: context.accountKey,
          accountDomain: context.accountDomain,
          personId: context.personId,
          enrichmentSummary: context.enrichmentSummary,
          techSummary: context.techSummary,
        },
      }
    );

    await storeUserPattern(
      groqQuery,
      upsertDocument,
      client,
      {
        userId: userInfo.userId || 'anonymous',
        userSegment: request.headers.get('X-User-Segment') || 'unknown',
        action,
        approach: prompt ? prompt.slice(0, 160) : `${request.method} ${url.pathname}`,
        context: {
          accountKey: context.accountKey || null,
          accountDomain: context.accountDomain || null,
          intent: patterns.intent || 'unknown',
          persona: request.headers.get('X-User-Persona') || null,
        },
        outcome,
        timeSpent: durationMs,
        toolsUsed: [url.pathname],
        sequence: [url.pathname],
        thinking: patterns.intent ? `intent:${patterns.intent}` : null,
        metadata: {
          requestId,
          method: request.method,
          prompt,
          personId: context.personId,
          enrichmentSummary: context.enrichmentSummary,
          techSummary: context.techSummary,
        },
      }
    );

    return {
      prompt,
      accountKey: context.accountKey || null,
      accountDomain: context.accountDomain || null,
      personId: context.personId || null,
      enrichmentSummary: context.enrichmentSummary || null,
      techSummary: context.techSummary || null,
      outcome,
    };
  } catch (error) {
    console.error('User action logging failed:', error);
    return null;
  }
}
