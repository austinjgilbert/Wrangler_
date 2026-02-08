/**
 * Learning & Pattern Matching Handlers
 * Handles learning endpoints and pattern matching
 */

import {
  extractQueryPatterns,
  matchHistoricalPatterns,
  generateSuggestions,
  anticipateUserNeeds,
  learnFromFeedback,
  buildPatternKnowledgeBase,
  getSmartSuggestions,
} from '../services/learning-service.js';

import {
  storeInteraction,
  getInteractionHistory,
  getAccountPatternKnowledge,
  storeFeedback,
  getLearningInsights,
} from '../services/learning-storage.js';

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

/**
 * Handle learning from interaction
 * POST /learn/interaction
 * 
 * @param {Request} request - Request object
 * @param {string} requestId - Request ID
 * @param {object} env - Environment variables
 * @param {Function} groqQuery - GROQ query function (passed from index.js)
 * @param {Function} upsertDocument - Upsert document function (passed from index.js)
 * @param {Function} assertSanityConfigured - Assert Sanity configured function (passed from index.js)
 */
export async function handleStoreInteraction(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    
    if (!body.query && !body.action) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either query or action required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Extract patterns from query
    const patterns = extractQueryPatterns(body.query || '', {
      account: body.account,
      previousActions: body.previousActions,
    });
    
    // Store interaction
    const interaction = {
      accountKey: body.accountKey || null,
      accountDomain: body.accountDomain || null,
      query: body.query || null,
      patterns: patterns,
      action: body.action || null,
      nextAction: body.nextAction || null,
      outcome: body.outcome || null,
      feedback: body.feedback || null,
      responseTime: body.responseTime || null,
      userId: body.userId || 'anonymous',
      sessionId: body.sessionId || null,
      metadata: body.metadata || {},
    };
    
    const result = await storeInteraction(
      groqQuery,
      upsertDocument,
      client,
      interaction
    );
    
    return createSuccessResponse({
      stored: result.success,
      interactionId: result.id,
      patterns: patterns,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to store interaction',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Handle getting suggestions
 * POST /learn/suggest
 * 
 * @param {Request} request - Request object
 * @param {string} requestId - Request ID
 * @param {object} env - Environment variables
 * @param {Function} groqQuery - GROQ query function (passed from index.js)
 * @param {Function} assertSanityConfigured - Assert Sanity configured function (passed from index.js)
 */
export async function handleGetSuggestions(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    const query = body.query || '';
    const accountKey = body.accountKey || null;
    const accountContext = body.accountContext || {};
    
    const client = assertSanityConfigured(env);
    
    // Extract patterns from query
    const currentPatterns = extractQueryPatterns(query, {
      account: accountContext.account,
    });
    
    // Get historical interactions
    const history = await getInteractionHistory(groqQuery, client, {
      accountKey,
      limit: 100,
    });
    
    // Match patterns
    const matchedHistory = matchHistoricalPatterns(currentPatterns, history);
    
    // Generate suggestions
    const suggestions = generateSuggestions(
      currentPatterns,
      matchedHistory,
      accountContext
    );
    
    // Get account pattern knowledge if available
    let smartSuggestions = [];
    if (accountKey) {
      const knowledgeBase = await getAccountPatternKnowledge(
        groqQuery,
        client,
        accountKey
      );
      const allInteractions = await getInteractionHistory(groqQuery, client, {
        accountKey,
        limit: 1000,
      });
      const fullKnowledgeBase = buildPatternKnowledgeBase(allInteractions);
      smartSuggestions = getSmartSuggestions(fullKnowledgeBase, currentPatterns);
    }
    
    // Combine suggestions
    const allSuggestions = [...suggestions, ...smartSuggestions]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
    
    return createSuccessResponse({
      suggestions: allSuggestions,
      patterns: currentPatterns,
      matchedHistory: matchedHistory.slice(0, 5),
      confidence: allSuggestions.length > 0 ? allSuggestions[0].confidence : 0,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to generate suggestions',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Handle anticipating user needs
 * POST /learn/anticipate
 * 
 * @param {Request} request - Request object
 * @param {string} requestId - Request ID
 * @param {object} env - Environment variables
 * @param {Function} groqQuery - GROQ query function (passed from index.js)
 * @param {Function} assertSanityConfigured - Assert Sanity configured function (passed from index.js)
 */
export async function handleAnticipateNeeds(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    const account = body.account || null;
    const accountKey = body.accountKey || null;
    
    if (!account && !accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either account or accountKey required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Get user history for this account
    const userHistory = await getInteractionHistory(groqQuery, client, {
      accountKey,
      limit: 50,
    });
    
    // Anticipate needs
    const anticipations = anticipateUserNeeds(account, userHistory, {
      accountKey,
    });
    
    return createSuccessResponse({
      anticipations: anticipations,
      historyCount: userHistory.length,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to anticipate needs',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Handle storing feedback
 * POST /learn/feedback
 * 
 * @param {Request} request - Request object
 * @param {string} requestId - Request ID
 * @param {object} env - Environment variables
 * @param {Function} groqQuery - GROQ query function (passed from index.js)
 * @param {Function} upsertDocument - Upsert document function (passed from index.js)
 * @param {Function} patchDocument - Patch document function (passed from index.js)
 * @param {Function} getDocument - Get document function (passed from index.js)
 * @param {Function} assertSanityConfigured - Assert Sanity configured function (passed from index.js)
 */
export async function handleStoreFeedback(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  getDocument,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    
    if (body.positive === undefined) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'positive field required (true/false)',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Store feedback
    const result = await storeFeedback(
      upsertDocument,
      client,
      {
        interactionId: body.interactionId || null,
        accountKey: body.accountKey || null,
        positive: body.positive,
        outcome: body.outcome || null,
        suggestion: body.suggestion || null,
        userComment: body.userComment || null,
        metadata: body.metadata || {},
      }
    );
    
    // If interaction ID provided, update interaction with feedback
    if (body.interactionId && body.interactionId.startsWith('interaction-')) {
      const interaction = await getDocument(client, body.interactionId);
      if (interaction) {
        await patchDocument(client, body.interactionId, {
          set: {
            feedback: body.positive ? 'positive' : 'negative',
            outcome: body.outcome || null,
            updatedAt: new Date().toISOString(),
          },
        });
      }
    }
    
    return createSuccessResponse({
      stored: result.success,
      feedbackId: result.id,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to store feedback',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Handle getting learning insights
 * GET /learn/insights
 * 
 * @param {Request} request - Request object
 * @param {string} requestId - Request ID
 * @param {object} env - Environment variables
 * @param {Function} groqQuery - GROQ query function (passed from index.js)
 * @param {Function} assertSanityConfigured - Assert Sanity configured function (passed from index.js)
 */
export async function handleGetLearningInsights(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const userId = url.searchParams.get('userId');
    
    const client = assertSanityConfigured(env);
    
    const filters = {};
    if (accountKey) filters.accountKey = accountKey;
    if (userId) filters.userId = userId;
    
    const insights = await getLearningInsights(
      groqQuery,
      client,
      filters
    );
    
    return createSuccessResponse({
      insights: insights,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get learning insights',
      { error: error.message },
      500,
      requestId
    );
  }
}

// Note: All Sanity functions (groqQuery, upsertDocument, etc.) are passed as parameters
// from index.js when calling these handlers. This keeps handlers modular and testable.

