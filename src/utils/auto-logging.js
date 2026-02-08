/**
 * Auto-logging helper for GPT interactions
 * Wraps GPT responses to automatically log interactions
 */

/**
 * Automatically log a GPT interaction
 * @param {string} userPrompt - What the user asked
 * @param {string} gptResponse - GPT's response
 * @param {object} context - Context object with entities and metadata
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {object} client - Sanity client
 * @returns {Promise<{success: boolean, interactionId?: string, sessionId?: string}>}
 */
export async function autoLogInteraction(
  userPrompt,
  gptResponse,
  context,
  groqQuery,
  upsertDocument,
  patchDocument,
  client
) {
  if (!userPrompt || !gptResponse) {
    return { success: false, error: 'Missing userPrompt or gptResponse' };
  }

  try {
    const { storeInteraction } = await import('../services/interaction-storage.js');
    
    // Extract referenced entities from context
    const referencedAccounts = context.accounts?.map(a => {
      if (typeof a === 'string') return a;
      return a._id || a.accountKey || a;
    }).filter(Boolean) || [];
    
    const referencedBriefs = context.briefs?.map(b => {
      if (typeof b === 'string') return b;
      return b._id || b;
    }).filter(Boolean) || [];
    
    const referencedPeople = context.persons?.map(p => {
      if (typeof p === 'string') return p;
      return p._id || p.personKey || p;
    }).filter(Boolean) || [];
    
    const referencedEvidence = context.evidence?.map(e => {
      if (typeof e === 'string') return e;
      return e._id || e;
    }).filter(Boolean) || [];

    // Get session ID from context (will be auto-created if not provided)
    const sessionId = context.sessionId || null;

    // Store interaction (sessionId is optional - will be auto-created)
    const result = await storeInteraction(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      {
        sessionId, // Optional - will create new session if null
        userPrompt,
        gptResponse,
        timestamp: context.timestamp || new Date().toISOString(),
        referencedAccounts,
        referencedBriefs,
        referencedPeople,
        referencedEvidence,
        contextTags: context.tags || context.contextTags || [],
        importance: context.importance || 0.5,
        followUpNeeded: context.followUpNeeded || false,
        followUpNotes: context.followUpNotes || null,
        derivedInsight: context.derivedInsight || false,
        linkedInteractions: context.linkedInteractions || [],
        requestId: context.requestId || null,
      },
      {}
    );

    if (result.success) {
      return {
        success: true,
        interactionId: result.interactionId,
        sessionId: result.sessionId,
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    // Don't break GPT response if logging fails
    console.error('Auto-logging failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve context before generating GPT response
 * @param {object} filters - Filters for context retrieval
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @returns {Promise<{summary: string, interactions: Array, learnings: Array, followUps: Array}>}
 */
export async function retrieveContextForGPT(
  filters,
  groqQuery,
  client
) {
  try {
    const { buildContextSummary } = await import('../services/context-retrieval.js');
    
    const summary = await buildContextSummary(groqQuery, client, {
      accountKey: filters.accountKey || null,
      domain: filters.domain || null,
      accountId: filters.accountId || null,
      contextTags: filters.contextTags || [],
      minRelevanceScore: filters.minRelevanceScore || 0.7,
    });

    return {
      success: true,
      summary,
    };
  } catch (error) {
    console.error('Context retrieval failed:', error);
    return {
      success: false,
      error: error.message,
      summary: 'No previous context found.',
    };
  }
}
