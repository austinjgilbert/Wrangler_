/**
 * Interaction Storage Service
 * Captures every Q&A exchange between user and GPT (WRANGLER)
 * Creates a living intelligence memory that tracks reasoning chains
 */

import { generateInteractionId, generateSessionId, generateLearningId } from '../utils/ids.js';

function normalizeRefId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id || value._ref || null;
}

function uniqueRefs(values = []) {
  return [...new Set(values.map(normalizeRefId).filter(Boolean))].map(refId => ({
    _type: 'reference',
    _ref: refId,
    _weak: false,
  }));
}

/**
 * Generate or retrieve session for interactions
 */
export async function getOrCreateSession(
  groqQuery,
  upsertDocument,
  client,
  sessionId = null,
  options = {}
) {
  const {
    title = null,
    participants = ['user', 'WRANGLER'],
    accountsInContext = [],
    briefsInContext = [],
  } = options;

  // If sessionId provided, try to find existing session
  if (sessionId) {
    const query = `*[_type == "session" && sessionId == $sessionId][0]`;
    const existing = await groqQuery(client, query, { sessionId });
    if (existing) {
      const mergedAccounts = uniqueRefs([
        ...(existing.accountsInContext || []),
        ...accountsInContext,
      ]);
      const mergedBriefs = uniqueRefs([
        ...(existing.briefsInContext || []),
        ...briefsInContext,
      ]);

      // Update lastUpdatedAt and carry forward newly discovered entities
      await upsertDocument(client, {
        _type: 'session',
        _id: existing._id,
        sessionId: existing.sessionId,
        title: existing.title,
        startedAt: existing.startedAt,
        participants: existing.participants || participants,
        accountsInContext: mergedAccounts,
        briefsInContext: mergedBriefs,
        learnings: existing.learnings || [],
        followUps: existing.followUps || [],
        interactionCount: existing.interactionCount || 0,
        createdAt: existing.createdAt,
        lastUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {
        success: true,
        sessionId: existing.sessionId,
        session: {
          ...existing,
          accountsInContext: mergedAccounts,
          briefsInContext: mergedBriefs,
          lastUpdatedAt: new Date().toISOString(),
        },
        isNew: false,
      };
    }
  }

  // Create new session
  const newSessionId = sessionId || generateSessionId();
  const now = new Date().toISOString();

  const sessionDoc = {
    _type: 'session',
    _id: `session.${newSessionId}`,
    sessionId: newSessionId,
    title: title || `Session ${new Date().toLocaleDateString()}`,
    startedAt: now,
    lastUpdatedAt: now,
    participants,
    accountsInContext: uniqueRefs(accountsInContext),
    briefsInContext: uniqueRefs(briefsInContext),
    learnings: [],
    followUps: [],
    interactionCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await upsertDocument(client, sessionDoc);
  // Sanity mutate does not return { success }; no throw = success

  return { success: true, sessionId: newSessionId, session: sessionDoc, isNew: true };
}

/**
 * Store interaction (Q&A exchange)
 */
export async function storeInteraction(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  interactionData,
  options = {}
) {
  const {
    sessionId,
    userPrompt,
    gptResponse,
    timestamp = new Date().toISOString(),
    referencedAccounts = [],
    referencedBriefs = [],
    referencedPeople = [],
    referencedEvidence = [],
    contextTags = [],
    importance = 0.5,
    followUpNeeded = false,
    followUpNotes = null,
    derivedInsight = false,
    linkedInteractions = [],
    requestId = null,
    domain = '',
    accountKey = '',
  } = interactionData;

  if (!userPrompt || !gptResponse) {
    return { success: false, error: 'Missing required fields: userPrompt, gptResponse' };
  }

  // Get or create session (will create if sessionId is null/undefined)
  const sessionResult = await getOrCreateSession(
    groqQuery,
    upsertDocument,
    client,
    sessionId || null, // Allow null, will generate new sessionId
    {
      accountsInContext: referencedAccounts,
      briefsInContext: referencedBriefs,
    }
  );

  if (!sessionResult.success) {
    return { success: false, error: 'Failed to get or create session' };
  }
  
  // Use the sessionId from the result (either existing or newly created)
  const finalSessionId = sessionResult.sessionId;

  // Generate interaction ID using final sessionId
  const interactionId = generateInteractionId(finalSessionId, timestamp);

  // Check if follow-up is needed (auto-detect from response)
  const autoFollowUpNeeded = followUpNeeded || 
    /follow up|revisit|later|next time|should we/i.test(gptResponse);

  // Check if derived insight (auto-detect from response)
  const autoDerivedInsight = derivedInsight ||
    /insight|conclusion|we found|we discovered|we identified/i.test(gptResponse);

  const interactionDoc = {
    _type: 'interaction',
    _id: `interaction.${interactionId}`,
    interactionId,
    sessionId: {
      _type: 'reference',
      _ref: sessionResult.session._id,
      _weak: false,
    },
    userPrompt,
    gptResponse,
    timestamp,
    referencedAccounts: uniqueRefs(referencedAccounts),
    referencedBriefs: uniqueRefs(referencedBriefs),
    referencedPeople: uniqueRefs(referencedPeople),
    referencedEvidence: uniqueRefs(referencedEvidence),
    contextTags,
    importance: Math.min(1, Math.max(0, importance)),
    followUpNeeded: autoFollowUpNeeded,
    followUpNotes: followUpNotes || (autoFollowUpNeeded ? 'Auto-flagged for follow-up' : null),
    derivedInsight: autoDerivedInsight,
    linkedInteractions: uniqueRefs(linkedInteractions),
    domain: domain || '',
    accountKey: accountKey || '',
    requestId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await upsertDocument(client, interactionDoc);
  // Sanity mutate does not return { success }; no throw = success

  // Update session with new interaction count
  try {
    const currentCount = sessionResult.session.interactionCount || 0;
    await patchDocument(client, sessionResult.session._id, {
      set: {
        interactionCount: currentCount + 1,
        lastUpdatedAt: timestamp,
        updatedAt: timestamp,
      },
    });
  } catch (error) {
    // Non-critical - interaction is stored, session update is optional
    // Log error without breaking - structured logging would be preferred but not blocking
    if (typeof console !== 'undefined' && console.error) {
      console.error(JSON.stringify({
        level: 'ERROR',
        message: 'Error updating session interaction count',
        error: error.message,
        sessionId: finalSessionId,
        interactionId,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  return {
    success: true,
    interactionId,
    interaction: interactionDoc,
    sessionId: finalSessionId,
  };
}

/**
 * Derive learning from interactions
 */
export async function deriveLearning(
  groqQuery,
  upsertDocument,
  client,
  learningData,
  options = {}
) {
  const {
    title,
    summary,
    derivedFrom = [],
    applicableToAccounts = [],
    applicableToBriefs = [],
    relevanceScore = 0.5,
    contextTags = [],
    memoryPhrase = null,
    patternType = 'learning',
    recommendedActions = [],
    confidence = null,
  } = learningData;

  if (!title || !summary) {
    return { success: false, error: 'Missing required fields: title, summary' };
  }

  // Generate learning ID
  const learningId = generateLearningId(Date.now().toString());

  const learningDoc = {
    _type: 'learning',
    _id: `learning.${learningId}`,
    learningId,
    title,
    summary,
    derivedFrom: uniqueRefs(derivedFrom),
    applicableToAccounts: uniqueRefs(applicableToAccounts),
    applicableToBriefs: uniqueRefs(applicableToBriefs),
    relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
    contextTags,
    memoryPhrase: memoryPhrase || title.substring(0, 100),
    patternType,
    recommendedActions,
    tags: contextTags,
    confidence: confidence ?? relevanceScore,
    createdAt: new Date().toISOString(),
    lastReferencedAt: null,
    referenceCount: 0,
  };

  await upsertDocument(client, learningDoc);
  // Sanity mutate does not return { success }; no throw = success

  return {
    success: true,
    learningId,
    learning: learningDoc,
  };
}
