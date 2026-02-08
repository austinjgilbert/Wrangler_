/**
 * Interaction Storage Service
 * Captures every Q&A exchange between user and GPT (WRANGLER)
 * Creates a living intelligence memory that tracks reasoning chains
 */

import { generateInteractionId, generateSessionId, generateLearningId } from '../utils/ids.js';

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
      // Update lastUpdatedAt
      await upsertDocument(client, {
        _type: 'session',
        _id: existing._id,
        lastUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return { success: true, sessionId: existing.sessionId, session: existing, isNew: false };
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
    accountsInContext: accountsInContext.map(accountId => ({
      _type: 'reference',
      _ref: typeof accountId === 'string' ? accountId : accountId._id || accountId,
      _weak: false,
    })),
    briefsInContext: briefsInContext.map(briefId => ({
      _type: 'reference',
      _ref: typeof briefId === 'string' ? briefId : briefId._id || briefId,
      _weak: false,
    })),
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
    referencedAccounts: referencedAccounts.map(accountId => ({
      _type: 'reference',
      _ref: typeof accountId === 'string' ? accountId : accountId._id || accountId,
      _weak: false,
    })),
    referencedBriefs: referencedBriefs.map(briefId => ({
      _type: 'reference',
      _ref: typeof briefId === 'string' ? briefId : briefId._id || briefId,
      _weak: false,
    })),
    referencedPeople: referencedPeople.map(personId => ({
      _type: 'reference',
      _ref: typeof personId === 'string' ? personId : personId._id || personId,
      _weak: false,
    })),
    referencedEvidence: referencedEvidence.map(evidenceId => ({
      _type: 'reference',
      _ref: typeof evidenceId === 'string' ? evidenceId : evidenceId._id || evidenceId,
      _weak: false,
    })),
    contextTags,
    importance: Math.min(1, Math.max(0, importance)),
    followUpNeeded: autoFollowUpNeeded,
    followUpNotes: followUpNotes || (autoFollowUpNeeded ? 'Auto-flagged for follow-up' : null),
    derivedInsight: autoDerivedInsight,
    linkedInteractions: linkedInteractions.map(interactionId => ({
      _type: 'reference',
      _ref: typeof interactionId === 'string' ? interactionId : interactionId._id || interactionId,
      _weak: false,
    })),
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
    derivedFrom: derivedFrom.map(interactionId => ({
      _type: 'reference',
      _ref: typeof interactionId === 'string' ? interactionId : interactionId._id || interactionId,
      _weak: false,
    })),
    applicableToAccounts: applicableToAccounts.map(accountId => ({
      _type: 'reference',
      _ref: typeof accountId === 'string' ? accountId : accountId._id || accountId,
      _weak: false,
    })),
    applicableToBriefs: applicableToBriefs.map(briefId => ({
      _type: 'reference',
      _ref: typeof briefId === 'string' ? briefId : briefId._id || briefId,
      _weak: false,
    })),
    relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
    contextTags,
    memoryPhrase: memoryPhrase || title.substring(0, 100),
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
